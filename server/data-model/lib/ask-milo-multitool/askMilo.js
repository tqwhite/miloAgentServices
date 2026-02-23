#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const os = require('os');
const path = require('path');
const fs = require('fs');
const commandLineParser = require('qtools-parse-command-line');
const configFileProcessor = require('qtools-config-file-processor');

//START OF moduleFunction() ============================================================
const moduleFunction = ({ moduleName } = {}) => ({ unused } = {}) => {
	const { xLog, getConfig, rawConfig, commandLineParameters, projectRoot } = process.global;
	const localConfig = getConfig(moduleName);

	// -- help text --
	if (commandLineParameters.switches.help) {
		xLog.result(`
askMilo -- AI Chorus of Experts Pipeline Processor

  Default: single prompt, single call, single response.
  Add --perspectives=N for multi-perspective chorus research.
  Add -summarize for cross-perspective synthesis.
  Any prompt from [prompts] section can serve any role.

Usage:
  askMilo [options] "your prompt here"
  echo '{ JSON }' | askMilo
  askMilo <<EOF
  { JSON }
  EOF

Pipeline control:
  --perspectives=N       Number of chorus perspectives. 0 = single-call (default: 0)
  --firstPrompt=NAME     Select prompt from [prompts] section of .ini
  -summarize             Add synthesis stage after chorus (requires perspectives>0)
  -serialFanOut          Run chorus agents sequentially instead of in parallel
                         (avoids 429 rate-limit errors on concurrent connections)
  -interrogate           Set prompt to interrogator + prepend analysis framing

Model & driver:
  --driver=DRIVER        API driver: direct|sdk (default: direct)
  --model=MODEL          Model for agents/single-call: opus|sonnet|haiku (default: sonnet)
  --expandModel=MODEL    Model for expansion stage: opus|sonnet|haiku (default: opus)

  SDK driver only (ignored by direct driver):
  --budget=USD           Max budget per agent in USD (default: 1.00)
  --maxTurns=N           Max conversation turns per agent (default: 10)
  --tools=LIST           Comma-separated tools for agents (use "none" to disable)

Output control:
  -verbose               Show detailed progress and cost info per stage
  -json                  Output raw JSON instead of formatted text report
  -dryRun                Run with mock responses, no API calls (alias for -mockApi)
  -mockApi               Same as -dryRun: return canned responses for testing
  -noSave                Do not save this run as a session
  -restoreSwitches       On --resumeSession, restore saved CLI args as defaults
  -help                  Show this help message

Session management:
  --resumeSession=NAME   Continue a previous session with a follow-up prompt
                         (auto-creates session if NAME doesn't exist)
  --sessionName=NAME     Name this session (default: auto-generated)
  -listSessions          List all saved sessions with date, size, prompt preview
  --viewSession=NAME     Display full session content
  --deleteSession=NAME   Delete a saved session
  --renameSession=NAME   Rename a session (use with --sessionName=NEW_NAME)

JSON input (programmatic):
  Accepts a JSON object via stdin or as the first argument, replacing
  CLI flag parsing entirely. The JSON must have the structure:
    { "switches": {...}, "values": {...}, "fileList": [...] }

  switches   Boolean flags (e.g. mockApi, noSave, verbose, summarize, serialFanOut)
  values     Keyed arrays    (e.g. model: ["haiku"], perspectives: ["3"])
  fileList   Positional args (the prompt goes here as the first element)

Examples:
  askMilo "What is quantum computing?"
  askMilo --perspectives=3 "Evaluate microservices vs monolith"
  askMilo --perspectives=3 -summarize "Compare ML frameworks"
  askMilo --firstPrompt=chorusResearcher "Analyze this transcript"
  askMilo --resumeSession=amber_ridge "How does this affect developing nations?"
  askMilo --resumeSession=amber_ridge -interrogate "Expand on the economic impacts"
  askMilo -listSessions
  askMilo --viewSession=amber_ridge

  JSON via stdin (for piping from scripts or AI agents):
  echo '{"switches":{"noSave":true},"values":{},"fileList":["What is 2+2?"]}' | askMilo

  JSON as argument:
  askMilo '{"switches":{"verbose":true},"values":{"model":["haiku"]},"fileList":["Summarize this"]}'

  JSON via heredoc (readable multi-line):
  askMilo <<EOF
  {
    "switches": { "noSave": true, "verbose": true },
    "values": { "model": ["haiku"], "perspectives": ["3"] },
    "fileList": ["Compare React, Vue, and Svelte"]
  }
  EOF
		`);
		return;
	}

	// -- session manager --
	const sessionManager = require('./lib/sessionManager');

	// -- session CLI commands (early exit, no pipeline needed) --

	// -listSessions
	if (commandLineParameters.switches.listSessions) {
		const sessions = sessionManager.listSessions();
		if (sessions.length === 0) {
			xLog.result('No saved sessions found.');
		} else {
			const header = `${'NAME'.padEnd(25)} ${'UPDATED'.padEnd(22)} ${'TURNS'.padEnd(6)} ${'SIZE'.padEnd(10)} PROMPT`;
			xLog.result(header);
			xLog.result('-'.repeat(header.length + 20));
			sessions.forEach(s => {
				const sizeKb = (s.sizeBytes / 1024).toFixed(1) + ' KB';
				const date = s.updatedAt.slice(0, 19).replace('T', ' ');
				xLog.result(`${s.name.padEnd(25)} ${date.padEnd(22)} ${String(s.turnCount).padEnd(6)} ${sizeKb.padEnd(10)} ${s.promptPreview}`);
			});
		}
		return;
	}

	// --viewSession=NAME
	const viewSessionName = (commandLineParameters.values.viewSession || [])[0];
	if (viewSessionName) {
		try {
			const session = sessionManager.loadSession(viewSessionName);
			xLog.result(`\n=== Session: ${session.sessionName} ===`);
			xLog.result(`Created: ${session.createdAt}`);
			xLog.result(`Updated: ${session.updatedAt}`);
			xLog.result(`Turns: ${(session.turns || []).length}`);
			if (session.totalCost) {
				xLog.result(`Total cost: $${(session.totalCost.usd || 0).toFixed(4)}`);
			}
			xLog.result('');
			(session.turns || []).forEach(turn => {
				const turnLabel = turn.turnType === 'singleCall' ? 'SingleCall'
					: turn.turnType === 'interrogation' ? 'Interrogation'
					: 'Turn';
				xLog.result(`--- ${turnLabel} ${turn.turnNumber} (${turn.timestamp || 'N/A'}) ---`);
				xLog.result(`Prompt: ${turn.prompt}`);
				xLog.result('');
				if (turn.turnType === 'singleCall') {
					const promptLabel = turn.promptName ? `[${turn.promptName}] ` : '';
					const resp = turn.response || '';
					xLog.result(`  ${promptLabel}RESPONSE: ${resp.slice(0, 400)}${resp.length > 400 ? '...' : ''}`);
					xLog.result('');
				} else if (turn.turnType === 'interrogation') {
					const resp = turn.response || '';
					xLog.result(`  RESPONSE: ${resp.slice(0, 400)}${resp.length > 400 ? '...' : ''}`);
					xLog.result('');
				} else {
					if (turn.perspectives) {
						turn.perspectives.forEach(p => {
							xLog.result(`  [${p.perspective}]: ${(p.findings || '').slice(0, 200)}${(p.findings || '').length > 200 ? '...' : ''}`);
						});
						xLog.result('');
					}
					if (turn.synthesis && turn.synthesis.text) {
						xLog.result(`  SYNTHESIS: ${turn.synthesis.text.slice(0, 300)}${turn.synthesis.text.length > 300 ? '...' : ''}`);
						xLog.result('');
					}
				}
				if (turn.totalCost) {
					xLog.result(`  Cost: $${(turn.totalCost.usd || 0).toFixed(4)}`);
				}
				xLog.result('');
			});
		} catch (e) {
			xLog.error(e.message);
		}
		return;
	}

	// --deleteSession=NAME
	const deleteSessionName = (commandLineParameters.values.deleteSession || [])[0];
	if (deleteSessionName) {
		try {
			sessionManager.deleteSession(deleteSessionName);
			xLog.result(`Session deleted: ${deleteSessionName}`);
		} catch (e) {
			xLog.error(e.message);
		}
		return;
	}

	// --renameSession=OLD --sessionName=NEW
	const renameSessionOld = (commandLineParameters.values.renameSession || [])[0];
	if (renameSessionOld) {
		const renameSessionNew = (commandLineParameters.values.sessionName || [])[0];
		if (!renameSessionNew) {
			xLog.error('--renameSession requires --sessionName=NEW_NAME');
			xLog.error('Usage: askMilo --renameSession=OLD_NAME --sessionName=NEW_NAME');
			return;
		}
		try {
			sessionManager.renameSession(renameSessionOld, renameSessionNew);
			xLog.result(`Session renamed: ${renameSessionOld} -> ${renameSessionNew}`);
		} catch (e) {
			xLog.error(e.message);
		}
		return;
	}

	// -- API key check --
	const apiKey = localConfig.anthropicApiKey;
	if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
		xLog.error(`Error: Set anthropicApiKey in ${moduleName}.ini`);
		xLog.error('Get an API key from https://platform.claude.com/');
		return;
	}

	// -- resolve model shorthand --
	const resolveModel = (shorthand) => {
		const substitutions = getConfig('_substitutions') || {};
		const modelMap = substitutions.modelMap || {};
		return modelMap[shorthand] || shorthand;
	};

	// -- build config from .ini + CLI args --
	const buildConfig = () => {
		let prompt = commandLineParameters.fileList.join(' ');
		const cfg = localConfig;
		const parsedPerspectives = parseInt(cfg.perspectives, 10);
		const perspectives = isNaN(parsedPerspectives) ? 0 : parsedPerspectives;
		const interrogate = !!commandLineParameters.switches.interrogate;

		// Read [prompts] section
		const prompts = getConfig('prompts') || {};

		// Resolve a prompt name to its text, applying template variables
		const resolvePrompt = (name, templateVars) => {
			const text = prompts[name];
			if (!text) throw new Error(`Prompt "${name}" not found in [prompts]. Available: ${Object.keys(prompts).join(', ')}`);
			let resolved = text.replace(/\\n/g, '\n');
			if (templateVars) {
				Object.keys(templateVars).forEach(key => {
					resolved = resolved.replace(new RegExp(`\\{${key}\\}`, 'g'), templateVars[key]);
				});
			}
			return resolved;
		};

		const templateVars = { N: String(perspectives) };

		// Resolve firstPromptName based on mode and flags
		let firstPromptName = (commandLineParameters.values.firstPrompt || [])[0];

		if (interrogate && !firstPromptName) {
			firstPromptName = 'interrogator';
		}
		if (!firstPromptName) {
			firstPromptName = perspectives > 0
				? (cfg.chorusExpanderPromptName || 'chorusExpander')
				: (cfg.singleCallPromptName || 'default');
		}

		// -interrogate prepends framing to the user's prompt
		if (interrogate) {
			prompt = `Analyze the prior research findings in context of the following question: ${prompt}`;
		}

		return {
			prompt,
			perspectives,
			agentModel: resolveModel(cfg.agentModel || 'sonnet'),
			expandModel: resolveModel(cfg.expandModel || 'opus'),
			budget: parseFloat(cfg.budget) || 1.00,
			maxTurns: parseInt(cfg.maxTurns, 10) || 10,
			tools: (cfg.tools || 'WebSearch,WebFetch,Read,Glob,Grep').toLowerCase() === 'none'
				? []
				: (cfg.tools || 'WebSearch,WebFetch,Read,Glob,Grep').split(',').map(t => t.trim()),
			verbose: !!commandLineParameters.switches.verbose,
			json: !!commandLineParameters.switches.json,
			dryRun: !!commandLineParameters.switches.dryRun,
			driver: (cfg.driver || 'direct').toLowerCase(),
			anthropicApiKey: cfg.anthropicApiKey,
			summarize: !!commandLineParameters.switches.summarize,
			interrogate,
			noSave: !!commandLineParameters.switches.noSave,
			restoreSwitches: !!commandLineParameters.switches.restoreSwitches,
			mockApi: !!commandLineParameters.switches.mockApi || !!commandLineParameters.switches.dryRun,
			serialFanOut: !!commandLineParameters.switches.serialFanOut,
			firstPromptName,
			firstPromptText: resolvePrompt(firstPromptName, templateVars),
			agentPromptName: cfg.agentPromptName || 'chorusResearcher',
			agentPromptText: resolvePrompt(cfg.agentPromptName || 'chorusResearcher', {}),
			summarizerPromptName: cfg.summarizerPromptName || 'chorusSynthesizer',
			summarizerPromptText: resolvePrompt(cfg.summarizerPromptName || 'chorusSynthesizer', templateVars),
			confluenceBaseUrl: cfg.confluenceBaseUrl,
			confluenceEmail: cfg.confluenceEmail,
			confluenceApiToken: cfg.confluenceApiToken,
			confluenceDefaultSpace: cfg.confluenceDefaultSpace || 'ARCHITECTU',
			resumeAddendumText: resolvePrompt('resumeAddendum', {}),
			jsonEnforcementText: resolvePrompt('jsonEnforcement', {}),
		};
	};

	const evalConfig = buildConfig();

	// -- -summarize warning --
	if (evalConfig.summarize && evalConfig.perspectives === 0) {
		xLog.error('Warning: -summarize ignored (no perspectives to synthesize)');
	}

	// -- session resume logic (Phase 6) --
	let resumeSession = null;
	let sessionContext = null;
	const resumeSessionName = (commandLineParameters.values.resumeSession || [])[0];
	if (resumeSessionName) {
		try {
			resumeSession = sessionManager.loadSession(resumeSessionName);
		} catch (e) {
			// Session not found — start a new one with that name
			xLog.error(`Session "${resumeSessionName}" not found. Starting new session with that name.`);
			commandLineParameters.values.sessionName = [resumeSessionName];
		}
		// Validate that a new prompt exists
		if (!evalConfig.prompt) {
			xLog.error('--resumeSession requires a new prompt.');
			xLog.error('Usage: askMilo --resumeSession=NAME "your follow-up question"');
			return;
		}
		// Restore saved CLI args as defaults when -restoreSwitches is set
		if (evalConfig.restoreSwitches && resumeSession.commandLineParameters) {
			const savedValues = resumeSession.commandLineParameters.values || {};
			const currentValues = commandLineParameters.values || {};
			const restoredKeys = [];

			// Map of saved value keys to evalConfig properties and their parsers
			const restoreMap = {
				perspectives: { prop: 'perspectives', parse: (v) => parseInt(v, 10) },
				agentModel: { prop: 'agentModel', parse: (v) => resolveModel(v) },
				model: { prop: 'agentModel', parse: (v) => resolveModel(v) },
				expandModel: { prop: 'expandModel', parse: (v) => resolveModel(v) },
				budget: { prop: 'budget', parse: (v) => parseFloat(v) },
				maxTurns: { prop: 'maxTurns', parse: (v) => parseInt(v, 10) },
				driver: { prop: 'driver', parse: (v) => String(v).toLowerCase() },
				firstPrompt: { prop: 'firstPromptName', parse: (v) => String(v) },
			};

			Object.keys(savedValues).forEach(key => {
				// Skip keys the current CLI explicitly set
				if (currentValues[key]) return;
				// Skip keys we don't know how to restore
				const mapping = restoreMap[key];
				if (!mapping) return;

				const savedVal = Array.isArray(savedValues[key]) ? savedValues[key][0] : savedValues[key];
				evalConfig[mapping.prop] = mapping.parse(savedVal);
				restoredKeys.push(`${key}=${savedVal}`);
			});

			if (evalConfig.verbose && restoredKeys.length > 0) {
				xLog.status(`[Resume] Restored from saved session: ${restoredKeys.join(', ')}`);
			}

			// If firstPromptName was restored, re-resolve firstPromptText to match
			if (restoredKeys.some(k => k.startsWith('firstPrompt='))) {
				const prompts = getConfig('prompts') || {};
				const text = prompts[evalConfig.firstPromptName];
				if (text) {
					let resolved = text.replace(/\\n/g, '\n');
					const templateVars = { N: String(evalConfig.perspectives) };
					Object.keys(templateVars).forEach(key => {
						resolved = resolved.replace(new RegExp(`\\{${key}\\}`, 'g'), templateVars[key]);
					});
					evalConfig.firstPromptText = resolved;
				}
			}
		}
		// Build session context from prior turns (only if session was found)
		if (resumeSession) {
			sessionContext = sessionManager.buildSessionContext(resumeSession);
			if (evalConfig.verbose) {
				xLog.status(`[Resume] Loaded session "${resumeSessionName}" with ${resumeSession.turns.length} prior turn(s)`);
				xLog.status(`[Resume] Session context: ${sessionContext.length} chars`);
			}
		}
	}

	// -- Confluence tool detection (needed for verbose display and pipeline routing) --
	const hasConfluenceTools = evalConfig.tools.some(t => t.toLowerCase() === 'confluence');

	if (evalConfig.verbose) {
		const modeLabel = evalConfig.perspectives === 0 ? 'singleCall' : `chorus (${evalConfig.perspectives} perspectives)`;
		xLog.status(`\n--- Config ---`);
		xLog.status(`  Mode:          ${modeLabel}`);
		xLog.status(`  First prompt:  ${evalConfig.firstPromptName}`);
		xLog.status(`  Expand model:  ${evalConfig.expandModel}`);
		xLog.status(`  Agent model:   ${evalConfig.agentModel}`);
		xLog.status(`  Perspectives:  ${evalConfig.perspectives}`);
		xLog.status(`  Max turns:     ${evalConfig.maxTurns}`);
		xLog.status(`  Budget/agent:  $${evalConfig.budget}`);
		xLog.status(`  Tools:         ${evalConfig.tools.length > 0 ? evalConfig.tools.join(', ') : '(none)'}`);
		xLog.status(`  Driver:        ${evalConfig.driver}`);
		xLog.status(`  Dry run:       ${evalConfig.dryRun}`);
		xLog.status(`  Summarize:     ${evalConfig.summarize}`);
		xLog.status(`  No save:       ${evalConfig.noSave}`);
		xLog.status(`  Restore args:  ${evalConfig.restoreSwitches}`);
		if (hasConfluenceTools) {
			xLog.status(`  Confluence:    ${evalConfig.confluenceBaseUrl || '(not set)'}`);
			xLog.status(`  Confl. space:  ${evalConfig.confluenceDefaultSpace || '(not set)'}`);
			xLog.status(`  Confl. email:  ${evalConfig.confluenceEmail || '(not set)'}`);
		}
		if (resumeSessionName) {
			xLog.status(`  Resume:        ${resumeSessionName}`);
		}
		xLog.status(`--- End Config ---\n`);
	}

	// -- usage validation --
	if (!evalConfig.prompt) {
		xLog.error('Usage: askMilo [options] "your prompt here"');
		xLog.error('Use -help for full options list');
		return;
	}

	// -- pipeline setup --
	const { pipeRunner, taskListPlus } = new (require('qtools-asynchronous-pipe-plus'))();
	const { collect } = require('./stages/collect');

	const taskList = new taskListPlus();

	if (evalConfig.perspectives === 0) {
		// ============================================================
		// SINGLE-CALL PIPELINE
		// ============================================================

		// SingleCall stage — route to tools-enabled driver when confluence tools are requested
		taskList.push((args, next) => {
			const useToolsDriver = hasConfluenceTools && args.config.driver === 'direct';

			if (useToolsDriver) {
				// -- Tools-enabled direct driver (confluence) --
				const mod = './stages/single-call-tools-direct.mjs';
				if (args.config.verbose) {
					xLog.status(`[SingleCall] Loading ${mod} (tools-enabled)...`);
					xLog.status(`[SingleCall] Mode: singleCallWithTools, Prompt: ${args.config.firstPromptName}, Model: ${args.config.agentModel}`);
				}

				// Create confluenceAccessor instance
				const confluenceAccessor = require('./lib/confluenceAccessor')({
					baseUrl: args.config.confluenceBaseUrl,
					email: args.config.confluenceEmail,
					apiToken: args.config.confluenceApiToken,
					defaultSpace: args.config.confluenceDefaultSpace,
					mockApi: args.config.mockApi,
				});

				// Get tool definitions and handler
				const confluenceTools = require('./lib/confluenceTools');
				const toolHandler = require('./lib/toolHandler');

				import(mod).then(({ singleCallWithTools }) => {
					singleCallWithTools({
						prompt: args.originalPrompt,
						systemPrompt: args.config.firstPromptText,
						sessionContext: args.sessionContext,
						config: args.config,
						tools: confluenceTools.getToolDefinitions(),
						toolHandler,
						accessor: confluenceAccessor,
					}).then(({ responseText, cost }) => {
						next('', { ...args, responseText, singleCallCost: cost });
					}).catch(err => next(err.message, args));
				});
			} else if (hasConfluenceTools && args.config.driver === 'sdk') {
				// -- SDK driver with Confluence MCP server --
				const mod = './stages/single-call.mjs';
				if (args.config.verbose) {
					xLog.status(`[SingleCall] Loading ${mod} (with Confluence MCP)...`);
					xLog.status(`[SingleCall] Mode: singleCallWithMCP, Prompt: ${args.config.firstPromptName}, Model: ${args.config.agentModel}`);
				}

				// Create confluenceAccessor instance
				const confluenceAccessor = require('./lib/confluenceAccessor')({
					baseUrl: args.config.confluenceBaseUrl,
					email: args.config.confluenceEmail,
					apiToken: args.config.confluenceApiToken,
					defaultSpace: args.config.confluenceDefaultSpace,
					mockApi: args.config.mockApi,
				});

				import(mod).then(({ singleCall }) => {
					singleCall({
						prompt: args.originalPrompt,
						systemPrompt: args.config.firstPromptText,
						sessionContext: args.sessionContext,
						config: args.config,
						accessor: confluenceAccessor,
					}).then(({ responseText, cost }) => {
						next('', { ...args, responseText, singleCallCost: cost });
					}).catch(err => next(err.message, args));
				});
			} else {
				// -- Standard driver (no tools) --
				const mod = args.config.driver === 'sdk' ? './stages/single-call.mjs' : './stages/single-call-direct.mjs';
				if (args.config.verbose) {
					xLog.status(`[SingleCall] Loading ${mod}...`);
					xLog.status(`[SingleCall] Mode: singleCall, Prompt: ${args.config.firstPromptName}, Model: ${args.config.agentModel}`);
				}
				import(mod).then(({ singleCall }) => {
					singleCall({
						prompt: args.originalPrompt,
						systemPrompt: args.config.firstPromptText,
						sessionContext: args.sessionContext,
						config: args.config,
					}).then(({ responseText, cost }) => {
						next('', { ...args, responseText, singleCallCost: cost });
					}).catch(err => next(err.message, args));
				});
			}
		});

		// Collect stage (single-call)
		taskList.push((args, next) => {
			const elapsedSeconds = (Date.now() - args.startTime) / 1000;
			if (args.config.verbose) {
				xLog.status(`[Collect] Formatting singleCall output...`);
			}
			const { report, reportJson } = collect({
				mode: 'singleCall',
				promptName: args.config.firstPromptName,
				prompt: args.originalPrompt,
				responseText: args.responseText,
				cost: args.singleCallCost,
				model: args.config.agentModel,
				elapsedSeconds,
				config: args.config,
			});
			next('', { ...args, report, reportJson, elapsedSeconds });
		});

	} else {
		// ============================================================
		// CHORUS PIPELINE (perspectives > 0)
		// ============================================================

		// Expand stage
		taskList.push((args, next) => {
			const expandModule = args.config.driver === 'sdk' ? './stages/expand.mjs' : './stages/expand-direct.mjs';
			if (args.config.verbose) {
				xLog.status(`[Expand] Loading ${expandModule}...`);
			}
			import(expandModule).then(({ expand }) => {
				if (args.config.verbose) {
					xLog.status(`[Expand] Calling ${args.config.expandModel} for expansion into ${args.config.perspectives} perspectives...`);
				}
				const stageStart = Date.now();
				expand({ originalPrompt: args.originalPrompt, config: args.config, sessionContext: args.sessionContext })
					.then(({ instructions, expandCost }) => {
						if (args.config.verbose) {
							const elapsed = ((Date.now() - stageStart) / 1000).toFixed(1);
							xLog.status(`[Expand] Complete in ${elapsed}s. Got ${instructions.length} perspectives:`);
							instructions.forEach(instr => {
								xLog.status(`  ${instr.id}. [${instr.perspective}]`);
							});
							xLog.status(`[Expand] Cost: $${expandCost.usd.toFixed(4)}`);
						}
						next('', { ...args, instructions, expandCost });
					})
					.catch(err => next(err.message, args));
			});
		});

		// Fan-out stage (skip if dry-run)
		taskList.push((args, next) => {
			if (args.config.dryRun) {
				if (args.config.verbose) {
					xLog.status(`[Fan-Out] Skipped (dry-run mode)`);
				}
				next('', args);
				return;
			}
			const fanOutModule = args.config.driver === 'sdk' ? './stages/fanOut.mjs' : './stages/fanOut-direct.mjs';
			if (args.config.verbose) {
				xLog.status(`[Fan-Out] Loading ${fanOutModule}...`);
			}
			import(fanOutModule).then(({ fanOut }) => {
				if (args.config.verbose) {
					xLog.status(`[Fan-Out] Launching ${args.instructions.length} research agents in parallel...`);
				}
				const stageStart = Date.now();
				fanOut({ instructions: args.instructions, config: args.config })
					.then(({ results }) => {
						if (args.config.verbose) {
							const elapsed = ((Date.now() - stageStart) / 1000).toFixed(1);
							xLog.status(`[Fan-Out] All agents returned in ${elapsed}s`);
							results.forEach(r => {
								if (r.findings.startsWith('[AGENT FAILED') || r.findings.startsWith('[AGENT ERROR')) {
									xLog.error(`  Agent ${r.id} (${r.perspective}): FAILED`);
								} else {
									xLog.status(`  Agent ${r.id} (${r.perspective}): done ($${r.cost.usd.toFixed(4)}, ${r.turns} turns)`);
								}
							});
						}
						next('', { ...args, results });
					})
					.catch(err => next(err.message, args));
			});
		});

		// Synthesize stage (only if -summarize is set and not dry-run)
		if (evalConfig.summarize) {
			taskList.push((args, next) => {
				if (args.config.dryRun) {
					if (args.config.verbose) {
						xLog.status(`[Synthesize] Skipped (dry-run mode)`);
					}
					next('', args);
					return;
				}
				const synthesizeModule = args.config.driver === 'sdk' ? './stages/synthesize.mjs' : './stages/synthesize-direct.mjs';
				if (args.config.verbose) {
					xLog.status(`[Synthesize] Loading ${synthesizeModule}...`);
				}
				import(synthesizeModule).then(({ synthesize }) => {
					if (args.config.verbose) {
						xLog.status(`[Synthesize] Calling ${args.config.expandModel} for cross-perspective synthesis...`);
					}
					const stageStart = Date.now();
					synthesize({
						originalPrompt: args.originalPrompt,
						instructions: args.instructions,
						results: args.results,
						config: args.config,
					})
						.then(({ synthesis, synthesisCost }) => {
							if (args.config.verbose) {
								const elapsed = ((Date.now() - stageStart) / 1000).toFixed(1);
								xLog.status(`[Synthesize] Complete in ${elapsed}s. Synthesis: ${synthesis.length} chars`);
								xLog.status(`[Synthesize] Cost: $${synthesisCost.usd.toFixed(4)}`);
							}
							next('', { ...args, synthesis, synthesisCost });
						})
						.catch(err => next(err.message, args));
				});
			});
		}

		// Collect stage (chorus)
		taskList.push((args, next) => {
			const elapsedSeconds = (Date.now() - args.startTime) / 1000;
			if (args.config.verbose) {
				xLog.status(`[Collect] Collecting and formatting chorus output...`);
			}

			if (args.config.dryRun) {
				const report = JSON.stringify(
					{ instructions: args.instructions, expandCost: args.expandCost },
					null, 2
				);
				next('', { ...args, report, elapsedSeconds });
				return;
			}
			const { report, reportJson } = collect({
				mode: 'chorus',
				originalPrompt: args.originalPrompt,
				instructions: args.instructions,
				results: args.results,
				expandCost: args.expandCost,
				synthesis: args.synthesis || null,
				synthesisCost: args.synthesisCost || null,
				elapsedSeconds,
				config: args.config,
			});
			next('', { ...args, report, reportJson, elapsedSeconds });
		});
	}

	// Run pipeline
	const initialData = {
		originalPrompt: evalConfig.prompt,
		config: evalConfig,
		startTime: Date.now(),
		sessionContext: sessionContext || null,
		session: resumeSession || null,
	};

	pipeRunner(taskList.getList(), initialData, (err, result) => {
		if (err) {
			xLog.error(`Pipeline error: ${err}`);
			process.exit(1);
		}

		if (result.config.verbose) {
			xLog.status(`Elapsed: ${result.elapsedSeconds.toFixed(1)}s`);
		}

		if (result.report) {
			xLog.result(result.report);
		}

		// -- Session save --
		if (!result.config.noSave) {
			try {
				const elapsedSeconds = result.elapsedSeconds || ((Date.now() - result.startTime) / 1000);
				const turnNumber = result.session ? result.session.turns.length + 1 : 1;

				let thisTurn;
				if (result.config.perspectives === 0) {
					// Single-call turn
					thisTurn = {
						turnNumber,
						turnType: 'singleCall',
						promptName: result.config.firstPromptName,
						prompt: result.originalPrompt,
						response: result.responseText,
						totalCost: result.singleCallCost,
						elapsedSeconds,
						timestamp: new Date().toISOString(),
					};
				} else {
					// Chorus turn
					thisTurn = sessionManager.buildTurnFromResults({
						originalPrompt: result.originalPrompt,
						instructions: result.instructions,
						results: result.results,
						expandCost: result.expandCost,
						synthesis: result.synthesis,
						synthesisCost: result.synthesisCost,
						elapsedSeconds,
						turnNumber,
					});
				}

				let session;
				if (result.session) {
					session = sessionManager.appendTurnToSession(result.session, thisTurn);
				} else {
					const sessionName = (commandLineParameters.values.sessionName || [])[0] || sessionManager.generateSessionName();
					session = sessionManager.createNewSession({
						sessionName,
						commandLineParameters,
						config: result.config,
						turn: thisTurn,
					});
				}

				sessionManager.saveSession(session);
				xLog.status(`Session saved: ${session.sessionName}`);
			} catch (saveErr) {
				xLog.error(`Warning: Failed to save session: ${saveErr.message}`);
			}
		}
	});
};

//END OF moduleFunction() ============================================================

// prettier-ignore
{
	const findProjectRoot = ({ rootFolderName = 'system', closest = true } = {}) =>
		__dirname.replace(new RegExp(`^(.*${closest ? '' : '?'}\\/${rootFolderName}).*$`), "$1");
	const projectRoot = findProjectRoot();

	let commandLineParameters = commandLineParser.getParameters({ noFunctions: true });

	// Accept JSON from stdin or argv[2] as override (bb2 pattern)
	try {
		const stdinText = !process.stdin.isTTY ? fs.readFileSync(0, 'utf8') : '';
		const possibleJson = process.argv[2] ? process.argv[2] : stdinText;
		commandLineParameters = JSON.parse(possibleJson);
		commandLineParameters.fromJson = true;
	} catch (err) {
		// no JSON found — use normal commandLineParameters from qtools-parse-command-line
	}

	// Map CLI flag names to .ini substitution tag names
	const cliToIniMap = { model: 'agentModel' };

	// Build userSubstitutions from CLI --key=value args to override .ini defaults
	const userSubstitutions = {};
	if (commandLineParameters.values) {
		Object.keys(commandLineParameters.values).forEach(key => {
			const val = commandLineParameters.values[key];
			const iniKey = cliToIniMap[key] || key;
			userSubstitutions[iniKey] = Array.isArray(val) ? val[0] : val;
		});
	}

	const configName = os.hostname() == 'qMini.local' ? 'instanceSpecific/qbook' : '';
	const configDirPath = `${projectRoot}/configs/${configName}/`;
	const config = configFileProcessor.getConfig(`${moduleName}.ini`, configDirPath, { resolve: false, userSubstitutions });

	const getConfig = (name) => {
		if (name == 'allConfigs') { return config; }
		return config[name];
	};

	process.global = {};
	process.global.xLog = { status: console.error, error: console.error, result: console.log };
	process.global.getConfig = getConfig;
	process.global.commandLineParameters = commandLineParameters;
	process.global.projectRoot = projectRoot;
	process.global.rawConfig = config;
}

module.exports = moduleFunction({ moduleName })({});
