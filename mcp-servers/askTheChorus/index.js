#!/usr/bin/env node

/**
 * MCP Server: askTheChorus
 *
 * Exposes the AI Chorus of Experts as an MCP tool.
 * Pays $1.00 USDC per request via x402 on Base mainnet.
 *
 * Requires MCP_TOOL_TIMEOUT >= 1200000 (20 min) in Claude Code settings.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// --- x402 wallet setup ---

const walletPath = join(homedir(), '.conway', 'wallet.json');
const wallet = JSON.parse(readFileSync(walletPath, 'utf-8'));
const signer = privateKeyToAccount(wallet.privateKey);

const paymentClient = new x402Client();
registerExactEvmScheme(paymentClient, { signer });

const fetchWithPayment = wrapFetchWithPayment(fetch, paymentClient);

// --- MCP server ---

const API_URL = 'https://milo2.life.conway.tech/api/askTheChorus';

const server = new McpServer({
	name: 'ask-the-chorus',
	version: '1.0.0',
});

server.tool(
	'ask_the_chorus',
	'Run an AI Chorus of Experts analysis. Sends a prompt to multiple AI expert perspectives, '
	+ 'each analyzing independently, then optionally synthesizes their responses. '
	+ 'Costs $1.00 USDC per request (paid automatically via x402 on Base). '
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
			const response = await fetchWithPayment(API_URL, {
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
