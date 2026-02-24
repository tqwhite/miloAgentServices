#!/usr/bin/env node

/**
 * MCP Server: askTheChorus
 *
 * Exposes the AI Chorus of Experts as two MCP tools:
 *   - submit_chorus_study: Submit a study for async processing ($1.00 USDC via x402)
 *   - check_chorus_study: Poll for results (free, no payment)
 *
 * The submit tool returns immediately with a session name for polling.
 * The check tool reads the session file and returns status + result when complete.
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

// --- URL constants ---

const SUBMIT_URL = 'https://milo3.life.conway.tech/api/submitChorusStudy';
const STATUS_URL = 'https://milo3.life.conway.tech/api/chorusStudyStatus';

// --- MCP server ---

const server = new McpServer({
	name: 'ask-the-chorus',
	version: '2.0.0',
});

// =============================================================================
// TOOL 1: submit_chorus_study (x402 paid)
// =============================================================================

server.tool(
	'submit_chorus_study',
	'Submit an AI Chorus of Experts study for async processing. '
	+ 'Returns immediately with a session name for polling. '
	+ 'Costs $1.00 USDC per submission (x402 on Base). '
	+ 'Use check_chorus_study to poll for results.',
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
		sessionName: z.string().optional()
			.describe('Existing session name for multi-turn (omit for new session)'),
	},
	async ({ prompt, perspectives, summarize, model, dryRun, serialFanOut, sessionName }) => {

		const requestBody = {
			switches: {
				...(serialFanOut && { serialFanOut: true }),
				...(summarize && { summarize: true }),
				...(dryRun && { dryRun: true }),
			},
			values: {
				perspectives: [String(perspectives)],
				model: [model],
				...(sessionName && { sessionName: [sessionName] }),
			},
			fileList: [prompt],
		};

		try {
			const response = await fetchWithPayment(SUBMIT_URL, {
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

			// The endpoint returns an array; unwrap the first element
			const submitResult = Array.isArray(result) ? result[0] : result;

			const estimatedMinutes = Math.ceil((submitResult.estimatedSeconds || 600) / 60);

			return {
				content: [{
					type: 'text',
					text: `Chorus study submitted as session '${submitResult.sessionName}' (turn ${submitResult.turnNumber}). `
						+ `Wait ~${estimatedMinutes} minutes, then poll with check_chorus_study('${submitResult.sessionName}', ${submitResult.turnNumber}). `
						+ `After first check, poll every 60 seconds. `
						+ `${submitResult.pollAdvice || ''}`,
				}],
			};
		} catch (err) {
			return {
				content: [{
					type: 'text',
					text: `Error submitting chorus study: ${err.message}`,
				}],
				isError: true,
			};
		}
	}
);

// =============================================================================
// TOOL 2: check_chorus_study (free, no x402)
// =============================================================================

server.tool(
	'check_chorus_study',
	'Check the status of a previously submitted chorus study. '
	+ 'No payment required for status checks. '
	+ 'Returns: running (still processing), complete (with full result), or error. '
	+ 'WARNING: Complete results can be 200KB+ for multi-perspective studies. '
	+ 'Consider writing results to a file or using a background agent rather than processing inline.',
	{
		sessionName: z.string().describe('Session name from submit_chorus_study'),
		turnNumber: z.number().describe('Turn number to check (usually 1)'),
	},
	async ({ sessionName, turnNumber }) => {

		const url = `${STATUS_URL}?sessionName=${encodeURIComponent(sessionName)}&turnNumber=${turnNumber}`;

		try {
			// Regular fetch — no x402 payment for status checks
			const response = await fetch(url);

			if (!response.ok) {
				const errorText = await response.text();
				return {
					content: [{
						type: 'text',
						text: `Error checking status: HTTP ${response.status} — ${errorText}`,
					}],
					isError: true,
				};
			}

			const result = await response.json();

			// The endpoint returns an array; unwrap the first element
			const statusResult = Array.isArray(result) ? result[0] : result;

			if (statusResult.status === 'running') {
				return {
					content: [{
						type: 'text',
						text: `Study '${sessionName}' is still running. `
							+ `Completed turns: ${statusResult.completedTurns || 0}. `
							+ `Check again in 60 seconds.`,
					}],
				};
			}

			if (statusResult.status === 'error') {
				return {
					content: [{
						type: 'text',
						text: `Study '${sessionName}' encountered an error: ${statusResult.message}`,
					}],
					isError: true,
				};
			}

			if (statusResult.status === 'complete') {
				return {
					content: [{
						type: 'text',
						text: JSON.stringify(statusResult.result, null, 2),
					}],
				};
			}

			// Unknown status
			return {
				content: [{
					type: 'text',
					text: `Unexpected status for '${sessionName}': ${JSON.stringify(statusResult)}`,
				}],
			};
		} catch (err) {
			return {
				content: [{
					type: 'text',
					text: `Error checking chorus study status: ${err.message}`,
				}],
				isError: true,
			};
		}
	}
);

// --- Start server ---

const transport = new StdioServerTransport();
await server.connect(transport);
