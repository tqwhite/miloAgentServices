// Stage 3 -- Synthesize (Direct API): cross-perspective analysis of all fan-out results
// Uses @anthropic-ai/sdk directly instead of Agent SDK subprocess

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import Anthropic from "@anthropic-ai/sdk";

// Cost estimation based on model pricing (per million tokens)
const MODEL_PRICING = {
	'claude-opus-4-6': { input: 5.00, output: 25.00 },
	'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
	'claude-haiku-4-5': { input: 1.00, output: 5.00 },
};

const estimateCost = (model, usage) => {
	const rates = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-6'];
	const inputCost = (usage.input_tokens / 1_000_000) * rates.input;
	const outputCost = (usage.output_tokens / 1_000_000) * rates.output;
	return inputCost + outputCost;
};

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
		xLog.status(`[Synthesize-Direct] Calling messages API with model=${config.expandModel}...`);
		xLog.status(`[Synthesize-Direct] User message length: ${userMessage.length} chars`);
	}

	const client = new Anthropic({ apiKey: config.anthropicApiKey });

	const requestParams = {
		model: config.expandModel,
		max_tokens: 16384,
		system: systemPrompt,
		messages: [{ role: "user", content: userMessage }],
	};

	// Use adaptive thinking for Opus 4.6, skip for others
	if (config.expandModel.includes('opus-4-6')) {
		requestParams.thinking = { type: "adaptive" };
	}

	const stream = client.messages.stream(requestParams);
	const response = await stream.finalMessage();

	if (verbose) {
		const blockTypes = response.content.map(b => b.type).join(', ');
		xLog.status(`[Synthesize-Direct] Response blocks: [${blockTypes}]`);
	}

	// Extract text blocks (skip thinking blocks) — with interleaved thinking,
	// there may be multiple text blocks. Concatenate all text content.
	const textParts = response.content
		.filter(b => b.type === 'text' && b.text)
		.map(b => b.text.trim())
		.filter(t => t.length > 0);

	const synthesis = textParts.length > 0 ? textParts.join('\n\n') : '[NO SYNTHESIS RESPONSE]';

	const synthesisCost = {
		inputTokens: response.usage.input_tokens,
		outputTokens: response.usage.output_tokens,
		usd: estimateCost(config.expandModel, response.usage),
	};

	if (verbose) {
		xLog.status(`[Synthesize-Direct] Success: ${synthesis.length} chars, ${synthesisCost.outputTokens} output tokens, $${synthesisCost.usd.toFixed(4)}`);
	}

	return { synthesis, synthesisCost };
};

export { synthesize };
