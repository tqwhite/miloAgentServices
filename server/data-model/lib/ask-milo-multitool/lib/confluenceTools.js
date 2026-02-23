'use strict';

// confluenceTools.js - Anthropic tool definitions for Confluence integration
// Exports tool definition arrays for the direct API driver path.
// CJS module.

// For direct driver: raw Anthropic tool definitions
const getToolDefinitions = () => [
	{
		name: 'confluence_search',
		description: 'Search Confluence documentation. Returns page titles, IDs, and excerpts. Use this to find relevant pages before reading their full content.',
		input_schema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Search text. Automatically wrapped in CQL for the configured space.' },
				cql: { type: 'string', description: 'Raw CQL for advanced searches. Overrides query if provided.' },
				limit: { type: 'integer', description: 'Max results (default 10, max 25)', default: 10 },
			},
			required: ['query'],
		},
	},
	{
		name: 'confluence_read_page',
		description: 'Read the full content of a Confluence page by ID. Returns title and body as clean markdown. Use page IDs from search results.',
		input_schema: {
			type: 'object',
			properties: {
				page_id: { type: 'string', description: 'Confluence page ID from search results' },
			},
			required: ['page_id'],
		},
	},
];

// Tool name list for filtering
const getToolNames = () => ['confluence_search', 'confluence_read_page'];

// For SDK driver: create an MCP server with execution handlers.
// SDK imports (tool, createSdkMcpServer, z) are injected by the ESM caller
// since this is a CJS module and cannot import from the ESM Agent SDK directly.
const createConfluenceMcpServer = (accessor, { tool, createSdkMcpServer, z }) => {
	return createSdkMcpServer({
		name: 'confluence',
		version: '1.0.0',
		tools: [
			tool('confluence_search', 'Search Confluence documentation. Returns page titles, IDs, and excerpts. Use this to find relevant pages before reading their full content.', {
				query: z.string().describe('Search text. Automatically wrapped in CQL for the configured space.'),
				cql: z.string().optional().describe('Raw CQL for advanced searches. Overrides query if provided.'),
				limit: z.number().optional().default(10).describe('Max results (default 10, max 25)'),
			}, async (args) => {
				const cql = args.cql || `text ~ "${args.query}"`;
				const results = await accessor.search({ cql, limit: args.limit });
				return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
			}),
			tool('confluence_read_page', 'Read the full content of a Confluence page by ID. Returns title and body as clean markdown. Use page IDs from search results.', {
				page_id: z.string().describe('Confluence page ID from search results'),
			}, async (args) => {
				const page = await accessor.getPage({ pageId: args.page_id });
				return { content: [{ type: 'text', text: `# ${page.title}\n\n${page.markdown}` }] };
			}),
		],
	});
};

module.exports = { getToolDefinitions, getToolNames, createConfluenceMcpServer };
