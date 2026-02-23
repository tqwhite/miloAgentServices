// SingleCall (SDK): generalized single-call pipeline stage using Agent SDK
// Handles any prompt + optional session context. SDK variant with tool access.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import { buildSdkEnv } from "./expand.mjs";

const singleCall = async ({ prompt, systemPrompt, sessionContext, config, accessor }) => {
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
		xLog.status(`[SingleCall-SDK] Calling query() with model=${model}...`);
		xLog.status(`[SingleCall-SDK] User message length: ${userMessage.length} chars`);
		if (sessionContext) {
			xLog.status(`[SingleCall-SDK] Session context injected (${sessionContext.length} chars)`);
		}
	}

	let responseText = '';
	let cost = { inputTokens: 0, outputTokens: 0, usd: 0 };

	// Build MCP servers map when confluence accessor is provided
	let mcpServers;
	if (accessor) {
		const { createConfluenceMcpServer } = require('../lib/confluenceTools');
		const mcpServer = createConfluenceMcpServer(accessor, { tool, createSdkMcpServer, z });
		mcpServers = { confluence: mcpServer };
		if (verbose) {
			xLog.status(`[SingleCall-SDK] Created Confluence MCP server (in-process)`);
		}
	}

	// Filter out 'confluence' from the built-in tools list — it's handled by the MCP server
	const builtInTools = config.tools.filter(t => t.toLowerCase() !== 'confluence');

	const queryOptions = {
		model,
		systemPrompt,
		permissionMode: "bypassPermissions",
		allowDangerouslySkipPermissions: true,
		maxTurns: config.maxTurns,
		maxBudgetUsd: config.budget,
		persistSession: false,
		env: buildSdkEnv(config.anthropicApiKey),
		tools: builtInTools.length > 0 ? builtInTools : [],
		...(mcpServers && { mcpServers }),
	};

	for await (const message of query({
		prompt: userMessage,
		options: queryOptions,
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
			xLog.status(`[SingleCall-SDK] SDK message: type=${message.type}${subtypeInfo}${detail}`);
		}
		if (message.type === "result") {
			if (message.subtype === "success") {
				responseText = message.result || '[NO RESPONSE]';
				cost = {
					inputTokens: (message.usage && message.usage.input_tokens) || 0,
					outputTokens: (message.usage && message.usage.output_tokens) || 0,
					usd: message.total_cost_usd || 0,
				};
				if (verbose) {
					xLog.status(`[SingleCall-SDK] Success: ${responseText.length} chars, ${cost.outputTokens} output tokens`);
				}
			} else {
				responseText = message.result || `[SINGLE-CALL ERROR: ${message.subtype}]`;
				cost = {
					inputTokens: (message.usage && message.usage.input_tokens) || 0,
					outputTokens: (message.usage && message.usage.output_tokens) || 0,
					usd: message.total_cost_usd || 0,
				};
			}
		}
	}

	if (!responseText || responseText.length === 0) {
		throw new Error("SingleCall returned empty result");
	}

	return { responseText, cost };
};

export { singleCall };
