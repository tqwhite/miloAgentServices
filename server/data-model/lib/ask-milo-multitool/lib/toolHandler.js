'use strict';

// toolHandler.js - Tool execution dispatcher for the direct API driver
// Receives tool_use blocks from Claude's response, executes against confluenceAccessor,
// returns content strings for tool_result messages.
// CJS module.

const executeToolCall = async ({ toolName, toolInput, accessor }) => {
	try {
		switch (toolName) {
			case 'confluence_search': {
				// If raw CQL is provided, use it directly; otherwise wrap simple query
				const cql = toolInput.cql || `text ~ "${toolInput.query}"`;
				const limit = toolInput.limit || 10;
				const results = await accessor.search({ cql, limit });
				return {
					content: JSON.stringify(results, null, 2),
				};
			}

			case 'confluence_read_page': {
				const page = await accessor.getPage({ pageId: toolInput.page_id });
				return {
					content: `# ${page.title}\n\nSpace: ${page.spaceKey} | Last updated: ${page.lastUpdated}\nURL: ${page.url}\n\n${page.markdown}`,
				};
			}

			default:
				return {
					content: `Unknown tool: ${toolName}`,
					is_error: true,
				};
		}
	} catch (err) {
		return {
			content: `Tool error (${toolName}): ${err.message}`,
			is_error: true,
		};
	}
};

module.exports = { executeToolCall };
