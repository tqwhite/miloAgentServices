'use strict';

// confluenceAccessor.js - Confluence HTTP accessor for askMilo
// Handles all HTTP communication with Confluence Cloud: auth, fetch, content conversion.
// No knowledge of Anthropic tools - pure HTTP.
// CJS module following moduleFunction pattern (curried factory).

const TurndownService = require('turndown');

//START OF moduleFunction() ============================================================
const moduleFunction = ({ baseUrl, email, apiToken, defaultSpace, mockApi } = {}) => {

	// -- Auth header construction --
	const getAuthHeader = () => {
		if (!email || !apiToken) return null;
		const credentials = Buffer.from(`${email}:${apiToken}`).toString('base64');
		return `Basic ${credentials}`;
	};

	// -- HTML content conversion: storage format -> markdown --
	const convertStorageToMarkdown = (storageHtml) => {
		if (!storageHtml) return '';

		// Strip Confluence-specific ac: and ri: elements before conversion
		// These are custom Atlassian XML elements that turndown won't understand
		let cleaned = storageHtml
			.replace(/<ac:[^>]*\/>/g, '')                          // self-closing ac: tags
			.replace(/<ac:[^>]*>[\s\S]*?<\/ac:[^>]*>/g, '')       // ac: tag pairs
			.replace(/<ri:[^>]*\/>/g, '')                          // self-closing ri: tags
			.replace(/<ri:[^>]*>[\s\S]*?<\/ri:[^>]*>/g, '');      // ri: tag pairs

		const turndownService = new TurndownService({
			headingStyle: 'atx',
			codeBlockStyle: 'fenced',
		});

		return turndownService.turndown(cleaned);
	};

	// -- Mock responses --
	const mockSearchResults = [
		{ id: 'MOCK-001', title: '[MOCK] SIF Infrastructure Overview', excerpt: '[MOCK] Overview of SIF standards...', url: '#mock' },
		{ id: 'MOCK-002', title: '[MOCK] True-Up Process Guide', excerpt: '[MOCK] Guide to true-up...', url: '#mock' },
	];

	const mockPageResult = {
		id: 'MOCK-001',
		title: '[MOCK] SIF Infrastructure Overview',
		spaceKey: 'ARCHITECTU',
		markdown: '[MOCK] # SIF Infrastructure\n\nThis is mock page content for testing the tool pipeline.\n\n## Key Concepts\n\n- Student Information Framework\n- True-up processes\n- Data exchange standards',
		url: '#mock',
		lastUpdated: '2026-01-15',
	};

	// -- Search using CQL --
	const search = async ({ cql, limit = 10 } = {}) => {
		if (mockApi) {
			return mockSearchResults;
		}

		const authHeader = getAuthHeader();
		if (!authHeader) throw new Error('Confluence credentials not configured');

		const encodedCql = encodeURIComponent(cql);
		const url = `${baseUrl}/wiki/rest/api/search?cql=${encodedCql}&limit=${limit}`;

		const response = await fetch(url, {
			headers: {
				'Authorization': authHeader,
				'Accept': 'application/json',
			},
		});

		if (!response.ok) {
			throw new Error(`Confluence search failed: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		const results = (data.results || []).map(result => ({
			id: String(result.content?.id || result.id || ''),
			title: result.content?.title || result.title || '',
			excerpt: (result.excerpt || '').replace(/<[^>]*>/g, '').trim(),
			url: result.content?._links?.webui
				? `${baseUrl}/wiki${result.content._links.webui}`
				: '#',
		}));

		return results;
	};

	// -- Get page content as markdown --
	const getPage = async ({ pageId } = {}) => {
		if (mockApi) {
			return mockPageResult;
		}

		const authHeader = getAuthHeader();
		if (!authHeader) throw new Error('Confluence credentials not configured');

		const url = `${baseUrl}/wiki/api/v2/pages/${pageId}?body-format=storage`;

		const response = await fetch(url, {
			headers: {
				'Authorization': authHeader,
				'Accept': 'application/json',
			},
		});

		if (!response.ok) {
			throw new Error(`Confluence getPage failed: ${response.status} ${response.statusText}`);
		}

		const page = await response.json();
		const storageBody = page.body?.storage?.value || '';
		const markdown = convertStorageToMarkdown(storageBody);

		return {
			id: String(page.id || pageId),
			title: page.title || '',
			spaceKey: page.spaceId ? String(page.spaceId) : (defaultSpace || ''),
			markdown,
			url: page._links?.webui
				? `${baseUrl}/wiki${page._links.webui}`
				: '#',
			lastUpdated: page.version?.createdAt || '',
		};
	};

	// -- List all pages in a space --
	const listPages = async ({ spaceKey, limit = 50 } = {}) => {
		if (mockApi) {
			return mockSearchResults.map(r => ({ id: r.id, title: r.title, url: r.url }));
		}

		const authHeader = getAuthHeader();
		if (!authHeader) throw new Error('Confluence credentials not configured');

		// First resolve space key to space ID via v2 API
		const spaceUrl = `${baseUrl}/wiki/api/v2/spaces?keys=${spaceKey || defaultSpace}`;
		const spaceResponse = await fetch(spaceUrl, {
			headers: {
				'Authorization': authHeader,
				'Accept': 'application/json',
			},
		});

		if (!spaceResponse.ok) {
			throw new Error(`Confluence space lookup failed: ${spaceResponse.status} ${spaceResponse.statusText}`);
		}

		const spaceData = await spaceResponse.json();
		const space = (spaceData.results || [])[0];
		if (!space) {
			throw new Error(`Space not found: ${spaceKey || defaultSpace}`);
		}

		const pagesUrl = `${baseUrl}/wiki/api/v2/spaces/${space.id}/pages?limit=${limit}`;
		const pagesResponse = await fetch(pagesUrl, {
			headers: {
				'Authorization': authHeader,
				'Accept': 'application/json',
			},
		});

		if (!pagesResponse.ok) {
			throw new Error(`Confluence listPages failed: ${pagesResponse.status} ${pagesResponse.statusText}`);
		}

		const pagesData = await pagesResponse.json();
		return (pagesData.results || []).map(page => ({
			id: String(page.id),
			title: page.title || '',
			url: page._links?.webui
				? `${baseUrl}/wiki${page._links.webui}`
				: '#',
		}));
	};

	// -- Test helper: expose auth header for unit testing --
	const _testGetAuthHeader = () => getAuthHeader();

	return { search, getPage, listPages, _testGetAuthHeader };
};
//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
