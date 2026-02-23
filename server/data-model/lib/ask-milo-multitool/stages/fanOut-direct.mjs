// Stage 2 -- Fan-Out (Direct API): dispatches N parallel research calls
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

const runOneAgent = async ({ instruction, config }) => {
	if (config.mockApi) {
		const { mockFanOutAgent } = require('../lib/mockApi');
		return mockFanOutAgent({ instruction, config });
	}

	const { xLog } = process.global;
	const verbose = config.verbose;
	const tag = `[Agent ${instruction.id}/${instruction.perspective}]`;

	if (verbose) {
		xLog.status(`\n========== ${tag} Starting ==========`);
		xLog.status(`${tag} model=${config.agentModel} (direct API, no tools)`);
	}

	const agentStart = Date.now();

	const client = new Anthropic({ apiKey: config.anthropicApiKey });

	const requestParams = {
		model: config.agentModel,
		max_tokens: 16384,
		system: config.agentPromptText,
		messages: [{ role: "user", content: instruction.instruction }],
	};

	// Use adaptive thinking for Opus 4.6, skip for others
	if (config.agentModel.includes('opus-4-6')) {
		requestParams.thinking = { type: "adaptive" };
	}

	if (verbose && config.tools.length > 0) {
		xLog.status(`${tag} Note: tools [${config.tools.join(', ')}] ignored in direct mode`);
	}

	const stream = client.messages.stream(requestParams);
	const response = await stream.finalMessage();

	// Extract text blocks (skip thinking blocks) — with interleaved thinking,
	// there may be multiple text blocks. Concatenate all text content.
	const textParts = response.content
		.filter(b => b.type === 'text' && b.text)
		.map(b => b.text.trim())
		.filter(t => t.length > 0);
	const findings = textParts.length > 0 ? textParts.join('\n\n') : '[NO RESPONSE]';

	const cost = {
		inputTokens: response.usage.input_tokens,
		outputTokens: response.usage.output_tokens,
		usd: estimateCost(config.agentModel, response.usage),
	};

	if (verbose) {
		const elapsed = ((Date.now() - agentStart) / 1000).toFixed(1);
		const blockTypes = response.content.map(b => b.type).join(', ');
		xLog.status(`${tag} Response blocks: [${blockTypes}]`);
		xLog.status(`========== ${tag} Finished in ${elapsed}s, $${cost.usd.toFixed(4)}, 1 turn ==========\n`);
	}

	return {
		id: instruction.id,
		perspective: instruction.perspective,
		instruction: instruction.instruction,
		findings,
		model: config.agentModel,
		cost,
		turns: 1,
	};
};

const fanOut = async ({ instructions, config }) => {
	const { xLog } = process.global;
	const verbose = config.verbose;

	if (verbose) {
		xLog.status(`[Fan-Out-Direct] Dispatching ${instructions.length} API calls via Promise.allSettled()...`);
	}

	const agentPromises = instructions.map((instruction) =>
		runOneAgent({ instruction, config })
	);

	const settled = await Promise.allSettled(agentPromises);

	if (verbose) {
		const fulfilled = settled.filter(s => s.status === 'fulfilled').length;
		const rejected = settled.filter(s => s.status === 'rejected').length;
		xLog.status(`[Fan-Out-Direct] All settled: ${fulfilled} fulfilled, ${rejected} rejected`);
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
