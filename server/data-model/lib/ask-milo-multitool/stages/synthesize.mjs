// Stage 3 -- Synthesize (SDK): cross-perspective analysis of all fan-out results
// Uses Agent SDK query() instead of direct API

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { query } from "@anthropic-ai/claude-agent-sdk";
import { buildSdkEnv } from "./expand.mjs";

const synthesize = async ({ originalPrompt, instructions, results, config }) => {
	if (config.mockApi) {
		const { mockSynthesize } = require('../lib/mockApi');
		return mockSynthesize({ originalPrompt, results, config });
	}

	const { xLog } = process.global;
	const verbose = config.verbose;
	const systemPrompt = config.summarizerPromptText;

	// Build user message: original prompt + all perspective findings
	const perspectiveSections = results.map((r) => {
		return `=== Perspective ${r.id}: ${r.perspective} ===\nMethodology: ${(instructions.find(i => i.id === r.id) || {}).methodology || 'N/A'}\n\nFindings:\n${r.findings}`;
	}).join('\n\n');

	const userMessage = `ORIGINAL RESEARCH QUESTION:\n${originalPrompt}\n\n` +
		`FINDINGS FROM ${results.length} INDEPENDENT ANALYSTS:\n\n${perspectiveSections}`;

	if (verbose) {
		xLog.status(`[Synthesize-SDK] Calling query() with model=${config.expandModel}...`);
		xLog.status(`[Synthesize-SDK] User message length: ${userMessage.length} chars`);
	}

	let synthesis = '';
	let synthesisCost = { inputTokens: 0, outputTokens: 0, usd: 0 };

	for await (const message of query({
		prompt: userMessage,
		options: {
			model: config.expandModel,
			systemPrompt: systemPrompt,
			permissionMode: "bypassPermissions",
			allowDangerouslySkipPermissions: true,
			maxTurns: 3,
			persistSession: false,
			env: buildSdkEnv(config.anthropicApiKey),
		}
	})) {
		if (verbose) {
			const subtypeInfo = message.subtype ? ` (${message.subtype})` : '';
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
			xLog.status(`[Synthesize-SDK] SDK message: type=${message.type}${subtypeInfo}${detail}`);
		}
		if (message.type === "result") {
			if (message.subtype === "success") {
				synthesis = message.result || '[NO SYNTHESIS RESPONSE]';
				synthesisCost = {
					inputTokens: (message.usage && message.usage.input_tokens) || 0,
					outputTokens: (message.usage && message.usage.output_tokens) || 0,
					usd: message.total_cost_usd || 0,
				};
				if (verbose) {
					xLog.status(`[Synthesize-SDK] Success: ${synthesis.length} chars, ${synthesisCost.outputTokens} output tokens`);
				}
			} else {
				throw new Error(`Synthesis failed: ${message.subtype} - ${JSON.stringify(message.errors || [])}`);
			}
		}
	}

	if (!synthesis || synthesis.length === 0) {
		throw new Error("Synthesis returned empty result");
	}

	return { synthesis, synthesisCost };
};

export { synthesize };
