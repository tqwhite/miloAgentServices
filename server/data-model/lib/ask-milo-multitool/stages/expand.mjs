// Stage 1 -- Expand: transforms a single prompt into N diverse research instructions
// This is a .mjs file because it imports from the Agent SDK (ES module)

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { query } from "@anthropic-ai/claude-agent-sdk";

// Build a clean env for SDK subprocess calls
// Must remove CLAUDECODE to allow nested Claude Code processes
const buildSdkEnv = (apiKey) => {
	const cleanEnv = { ...process.env };
	cleanEnv.ANTHROPIC_API_KEY = apiKey;
	delete cleanEnv.CLAUDECODE;
	delete cleanEnv.CLAUDE_CONFIG_DIR;
	delete cleanEnv.MILO_CONFIG_DIR;
	return cleanEnv;
};

const expansionSchema = {
	type: "object",
	properties: {
		instructions: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "number", description: "1-based index" },
					perspective: { type: "string", description: "Name of the analytical angle" },
					instruction: { type: "string", description: "Full research instruction for the agent" },
					methodology: { type: "string", description: "Brief note on approach/methodology" }
				},
				required: ["id", "perspective", "instruction", "methodology"]
			}
		}
	},
	required: ["instructions"]
};

export const expand = async ({ originalPrompt, config, sessionContext }) => {
	if (config.mockApi) {
		const { mockExpand } = require('../lib/mockApi');
		return mockExpand({ originalPrompt, config });
	}

	const { xLog } = process.global;
	const verbose = config.verbose;
	let systemPrompt = config.firstPromptText;

	// If resuming a session, add the resume addendum to the system prompt
	if (sessionContext) {
		systemPrompt += config.resumeAddendumText;
	}

	let instructions = [];
	let expandCost = { inputTokens: 0, outputTokens: 0, usd: 0 };

	// Build user message: new prompt + session context (if resuming)
	let userContent = originalPrompt;
	if (sessionContext) {
		userContent = `${originalPrompt}\n\n${sessionContext}`;
	}

	if (verbose) {
		xLog.status(`[Expand] Calling query() with model=${config.expandModel}...`);
		if (sessionContext) {
			xLog.status(`[Expand] Session context injected (${sessionContext.length} chars)`);
		}
	}

	for await (const message of query({
		prompt: userContent,
		options: {
			model: config.expandModel,
			systemPrompt: systemPrompt,
			permissionMode: "bypassPermissions",
			allowDangerouslySkipPermissions: true,
			maxTurns: 3,
			persistSession: false,
			env: buildSdkEnv(config.anthropicApiKey),
			outputFormat: {
				type: "json_schema",
				schema: expansionSchema
			}
		}
	})) {
		if (verbose) {
			const subtypeInfo = message.subtype ? ` (${message.subtype})` : '';
			// SDK content lives at message.message.content for assistant/user types
			let detail = '';
			if (message.message && Array.isArray(message.message.content)) {
				const blockSummaries = message.message.content.map(block => {
					if (block.type === 'thinking') return `thinking(${(block.thinking || '').length} chars)`;
					if (block.type === 'text') return `text: ${(block.text || '').slice(0, 100).replace(/\n/g, ' ')}`;
					if (block.type === 'tool_use') return `tool: ${block.name}`;
					return block.type;
				});
				detail = `: [${blockSummaries.join(', ')}]`;
			} else if (message.result) {
				detail = `: ${String(message.result).slice(0, 100).replace(/\n/g, ' ')}`;
			}
			xLog.status(`[Expand] SDK message: type=${message.type}${subtypeInfo}${detail}`);
		}
		if (message.type === "result") {
			if (message.subtype === "success") {
				const data = message.structured_output || JSON.parse(message.result);
				instructions = data.instructions || [];
				expandCost = {
					inputTokens: (message.usage && message.usage.input_tokens) || 0,
					outputTokens: (message.usage && message.usage.output_tokens) || 0,
					usd: message.total_cost_usd || 0,
				};
				if (verbose) {
					xLog.status(`[Expand] Success: ${instructions.length} instructions, ${expandCost.outputTokens} output tokens`);
				}
			} else {
				throw new Error(`Expansion failed: ${message.subtype} - ${JSON.stringify(message.errors || [])}`);
			}
		}
	}

	if (instructions.length === 0) {
		throw new Error("Expansion returned zero instructions");
	}

	return { instructions, expandCost };
};

export { buildSdkEnv };
