// Stage 1 -- Expand (Direct API): transforms a single prompt into N diverse research instructions
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

const expand = async ({ originalPrompt, config, sessionContext }) => {
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
	systemPrompt += config.jsonEnforcementText;

	if (verbose) {
		xLog.status(`[Expand-Direct] Calling messages API with model=${config.expandModel}...`);
		if (sessionContext) {
			xLog.status(`[Expand-Direct] Session context injected (${sessionContext.length} chars)`);
		}
	}

	const client = new Anthropic({ apiKey: config.anthropicApiKey });

	// Build user message: new prompt + session context (if resuming)
	let userContent = originalPrompt;
	if (sessionContext) {
		userContent = `${originalPrompt}\n\n${sessionContext}`;
	}

	const requestParams = {
		model: config.expandModel,
		max_tokens: 16384,
		system: systemPrompt,
		messages: [{ role: "user", content: userContent }],
	};

	// Use adaptive thinking for Opus 4.6, skip for others
	if (config.expandModel.includes('opus-4-6')) {
		requestParams.thinking = { type: "adaptive" };
	}

	const stream = client.messages.stream(requestParams);
	const response = await stream.finalMessage();

	if (verbose) {
		const blockTypes = response.content.map(b => b.type).join(', ');
		xLog.status(`[Expand-Direct] Response blocks: [${blockTypes}]`);
	}

	// Extract text blocks (skip thinking blocks) — with interleaved thinking,
	// there may be multiple text blocks. Concatenate all text content.
	const textParts = response.content
		.filter(b => b.type === 'text' && b.text)
		.map(b => b.text.trim())
		.filter(t => t.length > 0);

	if (textParts.length === 0) {
		throw new Error("Expansion returned no text content");
	}

	// Use the part that looks like JSON (starts with {), or fall back to last part
	let jsonText = textParts.find(t => t.startsWith('{')) || textParts[textParts.length - 1];
	if (jsonText.startsWith('```')) {
		jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
	}

	let data;
	try {
		data = JSON.parse(jsonText);
	} catch (parseErr) {
		if (verbose) {
			xLog.status(`[Expand-Direct] JSON parse failed. Raw text (first 500 chars):`);
			xLog.status(jsonText.slice(0, 500));
		}
		throw new Error(`Expansion JSON parse failed: ${parseErr.message}`);
	}

	const instructions = data.instructions || [];

	if (instructions.length === 0) {
		throw new Error("Expansion returned zero instructions");
	}

	const expandCost = {
		inputTokens: response.usage.input_tokens,
		outputTokens: response.usage.output_tokens,
		usd: estimateCost(config.expandModel, response.usage),
	};

	if (verbose) {
		xLog.status(`[Expand-Direct] Success: ${instructions.length} instructions, ${expandCost.outputTokens} output tokens, $${expandCost.usd.toFixed(4)}`);
	}

	return { instructions, expandCost };
};

export { expand };
