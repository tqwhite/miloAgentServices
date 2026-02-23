// Stage 2 -- Fan-Out: dispatches N parallel research agents
// This is a .mjs file because it imports from the Agent SDK (ES module)

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { query } from "@anthropic-ai/claude-agent-sdk";
import { buildSdkEnv } from "./expand.mjs";

const runOneAgent = async ({ instruction, config }) => {
	if (config.mockApi) {
		const { mockFanOutAgent } = require('../lib/mockApi');
		return mockFanOutAgent({ instruction, config });
	}

	const { xLog } = process.global;
	const verbose = config.verbose;
	const tag = `[Agent ${instruction.id}/${instruction.perspective}]`;
	let findings = "";
	let cost = { inputTokens: 0, outputTokens: 0, usd: 0 };
	let turns = 0;

	if (verbose) {
		xLog.status(`\n========== ${tag} Starting ==========`);
		xLog.status(`${tag} model=${config.agentModel}, maxTurns=${config.maxTurns}, budget=$${config.budget}`);
	}

	const agentStart = Date.now();

	const queryOptions = {
		model: config.agentModel,
		systemPrompt: config.agentPromptText,
		permissionMode: "bypassPermissions",
		allowDangerouslySkipPermissions: true,
		maxTurns: config.maxTurns,
		maxBudgetUsd: config.budget,
		persistSession: false,
		env: buildSdkEnv(config.anthropicApiKey),
		tools: config.tools.length > 0 ? config.tools : [],
	};

	for await (const message of query({
		prompt: instruction.instruction,
		options: queryOptions,
	})) {
		if (verbose) {
			const elapsed = ((Date.now() - agentStart) / 1000).toFixed(1);
			// SDK messages: content lives at message.message.content (array of blocks)
			const describeMessage = (msg) => {
				if (msg.type === "system") {
					return `system: ${msg.subtype || 'init'}`;
				}
				if (msg.type === "result") {
					return `result: subtype=${msg.subtype}, turns=${msg.num_turns || 0}`;
				}
				// assistant and user messages have content at msg.message.content
				const contentBlocks = (msg.message && msg.message.content) || [];
				if (!Array.isArray(contentBlocks) || contentBlocks.length === 0) {
					return `${msg.type}: (no content blocks)`;
				}
				const parts = contentBlocks.map(block => {
					if (block.type === 'thinking') {
						const preview = (block.thinking || '').slice(0, 200).replace(/\n/g, ' ');
						return `    THINKING: ${preview}`;
					}
					if (block.type === 'text') {
						const preview = (block.text || '').slice(0, 200).replace(/\n/g, ' ');
						return `    TEXT: ${preview}`;
					}
					if (block.type === 'tool_use') {
						const inputPreview = JSON.stringify(block.input || {}).slice(0, 200);
						return `    TOOL CALL: ${block.name}(${inputPreview})`;
					}
					if (block.type === 'tool_result') {
						const resultContent = block.content || block.output || '';
						const preview = (typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent)).slice(0, 200).replace(/\n/g, ' ');
						return `    TOOL RESULT: ${preview}`;
					}
					return `    ${block.type}: ${JSON.stringify(block).slice(0, 150)}`;
				});
				return `${msg.type}:\n${parts.join('\n')}`;
			};
			xLog.status(`${tag} ${elapsed}s ${describeMessage(message)}`);
		}
		if (message.type === "result") {
			if (message.subtype === "success") {
				findings = message.result;
				cost = {
					inputTokens: (message.usage && message.usage.input_tokens) || 0,
					outputTokens: (message.usage && message.usage.output_tokens) || 0,
					usd: message.total_cost_usd || 0,
				};
				turns = message.num_turns || 0;
			} else {
				// Capture partial results if available, otherwise report error
				findings = message.result || `[AGENT ERROR: ${message.subtype}]`;
				cost = {
					inputTokens: (message.usage && message.usage.input_tokens) || 0,
					outputTokens: (message.usage && message.usage.output_tokens) || 0,
					usd: message.total_cost_usd || 0,
				};
				turns = message.num_turns || 0;
			}
		}
	}

	if (verbose) {
		const elapsed = ((Date.now() - agentStart) / 1000).toFixed(1);
		xLog.status(`========== ${tag} Finished in ${elapsed}s, $${cost.usd.toFixed(4)}, ${turns} turns ==========\n`);
	}

	return {
		id: instruction.id,
		perspective: instruction.perspective,
		instruction: instruction.instruction,
		findings,
		model: config.agentModel,
		cost,
		turns,
	};
};

const fanOut = async ({ instructions, config }) => {
	const { xLog } = process.global;
	const verbose = config.verbose;

	if (verbose) {
		xLog.status(`[Fan-Out] Dispatching ${instructions.length} agents via Promise.allSettled()...`);
	}

	const agentPromises = instructions.map((instruction) =>
		runOneAgent({ instruction, config })
	);

	const settled = await Promise.allSettled(agentPromises);

	if (verbose) {
		const fulfilled = settled.filter(s => s.status === 'fulfilled').length;
		const rejected = settled.filter(s => s.status === 'rejected').length;
		xLog.status(`[Fan-Out] All settled: ${fulfilled} fulfilled, ${rejected} rejected`);
	}

	const results = [];
	settled.forEach((outcome, idx) => {
		if (outcome.status === "fulfilled") {
			results.push(outcome.value);
		} else {
			results.push({
				id: instructions[idx].id,
				perspective: instructions[idx].perspective,
				instruction: instructions[idx].instruction,
				findings: `[AGENT FAILED: ${outcome.reason}]`,
				model: config.agentModel,
				cost: { inputTokens: 0, outputTokens: 0, usd: 0 },
				turns: 0,
			});
		}
	});

	return { results };
};

export { runOneAgent, fanOut };
