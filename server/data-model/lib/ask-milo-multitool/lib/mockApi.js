'use strict';

const mockSingleCall = ({ prompt, systemPrompt, config }) => {
	const responseText = `[MOCK] Response to: "${(prompt || '').slice(0, 80)}..."\nSystem prompt: ${(systemPrompt || '').slice(0, 60)}...\nModel: ${config.agentModel}`;
	return {
		responseText,
		cost: { inputTokens: 100, outputTokens: 200, usd: 0.0001 },
	};
};

const mockExpand = ({ originalPrompt, config }) => {
	const N = config.perspectives;
	const instructions = [];
	for (let i = 1; i <= N; i++) {
		instructions.push({
			id: i,
			perspective: `Mock Perspective ${i}`,
			instruction: `[MOCK] Research instruction ${i} for: "${(originalPrompt || '').slice(0, 60)}..."`,
			methodology: `Mock methodology ${i}`,
		});
	}
	return {
		instructions,
		expandCost: { inputTokens: 150, outputTokens: 300, usd: 0.0002 },
	};
};

const mockFanOutAgent = ({ instruction, config }) => {
	return {
		id: instruction.id,
		perspective: instruction.perspective,
		instruction: instruction.instruction,
		findings: `[MOCK] Findings for perspective ${instruction.id}: ${instruction.perspective}.\nThis is canned mock data for testing pipeline structure.`,
		model: config.agentModel,
		cost: { inputTokens: 200, outputTokens: 400, usd: 0.0003 },
		turns: 1,
	};
};

const mockSynthesize = ({ originalPrompt, results, config }) => {
	return {
		synthesis: `[MOCK] Synthesis of ${results.length} perspectives for: "${(originalPrompt || '').slice(0, 60)}..."`,
		synthesisCost: { inputTokens: 300, outputTokens: 600, usd: 0.0004 },
	};
};

const mockInterrogate = ({ question, config }) => {
	return {
		responseText: `[MOCK] Interrogation response to: "${(question || '').slice(0, 80)}..."`,
		cost: { inputTokens: 250, outputTokens: 500, usd: 0.0003 },
	};
};

// -- Confluence mock functions (for use by confluenceAccessor mock mode) --

const mockConfluenceSearch = ({ cql, limit }) => {
	return [
		{ id: 'MOCK-001', title: '[MOCK] SIF Infrastructure Overview', excerpt: '[MOCK] Overview of SIF standards...', url: '#mock' },
		{ id: 'MOCK-002', title: '[MOCK] True-Up Process Guide', excerpt: '[MOCK] Guide to true-up...', url: '#mock' },
	];
};

const mockConfluenceGetPage = ({ pageId }) => {
	return {
		id: pageId || 'MOCK-001',
		title: '[MOCK] SIF Infrastructure Overview',
		spaceKey: 'ARCHITECTU',
		markdown: '[MOCK] # SIF Infrastructure\n\nThis is mock page content for testing the tool pipeline.\n\n## Key Concepts\n\n- Student Information Framework\n- True-up processes\n- Data exchange standards',
		url: '#mock',
		lastUpdated: '2026-01-15',
	};
};

module.exports = { mockSingleCall, mockExpand, mockFanOutAgent, mockSynthesize, mockInterrogate, mockConfluenceSearch, mockConfluenceGetPage };
