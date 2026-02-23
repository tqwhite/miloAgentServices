// SingleCall (Direct API): generalized single-call pipeline stage
// Handles any prompt + optional session context. Generalized from interrogate-direct.mjs.
// Uses @anthropic-ai/sdk directly.

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

const singleCall = async ({ prompt, systemPrompt, sessionContext, config }) => {
	if (config.mockApi) {
		const { mockSingleCall } = require('../lib/mockApi');
		return mockSingleCall({ prompt, systemPrompt, config });
	}

	const { xLog } = process.global;
	const verbose = config.verbose;
	const model = config.agentModel;

	// Build user message: prompt + optional session context
	let userMessage = prompt;
	if (sessionContext) {
		userMessage = `${sessionContext}\n\n--- NEW PROMPT ---\n${prompt}`;
	}

	if (verbose) {
		xLog.status(`[SingleCall] Calling messages API with model=${model}...`);
		xLog.status(`[SingleCall] User message length: ${userMessage.length} chars`);
		if (sessionContext) {
			xLog.status(`[SingleCall] Session context injected (${sessionContext.length} chars)`);
		}
	}

	const client = new Anthropic({ apiKey: config.anthropicApiKey });

	const requestParams = {
		model,
		max_tokens: 16384,
		system: systemPrompt,
		messages: [{ role: "user", content: userMessage }],
	};

	// Use adaptive thinking for Opus 4.6, skip for others
	if (model.includes('opus-4-6')) {
		requestParams.thinking = { type: "adaptive" };
	}

	const stream = client.messages.stream(requestParams);
	const response = await stream.finalMessage();

	if (verbose) {
		const blockTypes = response.content.map(b => b.type).join(', ');
		xLog.status(`[SingleCall] Response blocks: [${blockTypes}]`);
	}

	// Extract text blocks (skip thinking blocks)
	const textParts = response.content
		.filter(b => b.type === 'text' && b.text)
		.map(b => b.text.trim())
		.filter(t => t.length > 0);

	const responseText = textParts.length > 0 ? textParts.join('\n\n') : '[NO RESPONSE]';

	const cost = {
		inputTokens: response.usage.input_tokens,
		outputTokens: response.usage.output_tokens,
		usd: estimateCost(model, response.usage),
	};

	if (verbose) {
		xLog.status(`[SingleCall] Success: ${responseText.length} chars, ${cost.outputTokens} output tokens, $${cost.usd.toFixed(4)}`);
	}

	return { responseText, cost };
};

export { singleCall };
