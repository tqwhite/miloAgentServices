#!/usr/bin/env node

/**
 * MCP Server: askTheChorus
 *
 * Exposes the AI Chorus of Experts as an MCP tool.
 * Calls the private (unlisted) endpoint on Conway — no x402 payment.
 *
 * Version 1: Blocking HTTP call. Requires MCP_TOOL_TIMEOUT >= 1200000.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_URL = 'https://milo2.life.conway.tech/api/private/askTheChorus';

const server = new McpServer({
	name: 'ask-the-chorus',
	version: '1.0.0',
});

server.tool(
	'ask_the_chorus',
	'Run an AI Chorus of Experts analysis. Sends a prompt to multiple AI expert perspectives, '
	+ 'each analyzing independently, then optionally synthesizes their responses. '
	+ 'Takes 5-15 minutes depending on perspectives and model. '
	+ 'Returns structured JSON with individual perspectives and synthesis.',
	{
		prompt: z.string().describe('The question or topic for the chorus to analyze'),
		perspectives: z.number().optional().default(3)
			.describe('Number of expert perspectives (0 = single-call, no chorus)'),
		summarize: z.boolean().optional().default(true)
			.describe('Add synthesis stage after perspectives'),
		model: z.enum(['opus', 'sonnet', 'haiku']).optional().default('sonnet')
			.describe('AI model to use for each agent'),
		dryRun: z.boolean().optional().default(false)
			.describe('Use mock responses — no API calls, for testing'),
		serialFanOut: z.boolean().optional().default(true)
			.describe('Run agents sequentially (avoids rate limits)'),
	},
	async ({ prompt, perspectives, summarize, model, dryRun, serialFanOut }) => {

		const requestBody = {
			switches: {
				...(serialFanOut && { serialFanOut: true }),
				...(summarize && { summarize: true }),
				...(dryRun && { dryRun: true }),
			},
			values: {
				perspectives: [String(perspectives)],
				model: [model],
			},
			fileList: [prompt],
		};

		try {
			const response = await fetch(API_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const errorText = await response.text();
				return {
					content: [{
						type: 'text',
						text: `Error: HTTP ${response.status} — ${errorText}`,
					}],
					isError: true,
				};
			}

			const result = await response.json();

			return {
				content: [{
					type: 'text',
					text: JSON.stringify(result, null, 2),
				}],
			};
		} catch (err) {
			return {
				content: [{
					type: 'text',
					text: `Error calling askTheChorus: ${err.message}`,
				}],
				isError: true,
			};
		}
	}
);

const transport = new StdioServerTransport();
await server.connect(transport);
