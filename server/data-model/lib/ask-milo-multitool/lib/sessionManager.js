'use strict';
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const os = require('os');
const path = require('path');
const fs = require('fs');

// Session storage location
const SESSION_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'askMilo', 'sessions');

// Word lists for session name generation
const ADJECTIVES = [
	'amber', 'azure', 'bright', 'calm', 'coral', 'crystal', 'dawn', 'deep',
	'ember', 'fern', 'frost', 'gentle', 'golden', 'grand', 'green', 'harbor',
	'iron', 'ivory', 'jade', 'keen', 'lush', 'maple', 'misty', 'noble',
	'opal', 'pale', 'pearl', 'quiet', 'rapid', 'rose', 'ruby', 'sage',
	'scarlet', 'shadow', 'silver', 'slate', 'soft', 'stark', 'steel', 'stone',
	'swift', 'tidal', 'twilight', 'vast', 'velvet', 'violet', 'warm', 'wild',
	'winter', 'woven',
];

const NOUNS = [
	'arch', 'basin', 'beacon', 'brook', 'canyon', 'cedar', 'cliff', 'crest',
	'delta', 'drift', 'dune', 'falcon', 'field', 'flame', 'forge', 'gate',
	'glade', 'grove', 'harbor', 'heath', 'hollow', 'isle', 'lake', 'ledge',
	'marsh', 'meadow', 'mesa', 'mist', 'moss', 'oak', 'pass', 'peak',
	'pine', 'plain', 'pond', 'prairie', 'range', 'reef', 'ridge', 'river',
	'shore', 'spring', 'stone', 'summit', 'tide', 'tower', 'trail', 'vale',
	'valley', 'vista',
];

//START OF moduleFunction() ============================================================
const moduleFunction = ({ moduleName } = {}) => ({ unused } = {}) => {

	const ensureSessionDir = () => {
		fs.mkdirSync(SESSION_DIR, { recursive: true });
	};

	const generateSessionName = () => {
		ensureSessionDir();
		const existingFiles = fs.readdirSync(SESSION_DIR)
			.filter(f => f.endsWith('.json'))
			.map(f => f.replace('.json', ''));
		const existingSet = new Set(existingFiles);

		// Try up to 100 times to get a unique name
		for (let attempt = 0; attempt < 100; attempt++) {
			const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
			const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
			const name = `${adj}_${noun}`;
			if (!existingSet.has(name)) {
				return name;
			}
		}
		// Fallback: append timestamp
		const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
		const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
		return `${adj}_${noun}_${Date.now()}`;
	};

	const saveSession = (session) => {
		ensureSessionDir();
		session.updatedAt = new Date().toISOString();
		const filePath = path.join(SESSION_DIR, `${session.sessionName}.json`);
		fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf8');
		return filePath;
	};

	const loadSession = (name) => {
		const filePath = path.join(SESSION_DIR, `${name}.json`);
		if (!fs.existsSync(filePath)) {
			throw new Error(`Session not found: "${name}". Use -listSessions to see available sessions.`);
		}
		const raw = fs.readFileSync(filePath, 'utf8');
		return JSON.parse(raw);
	};

	const listSessions = () => {
		ensureSessionDir();
		const files = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith('.json'));
		const sessions = [];
		for (const file of files) {
			const filePath = path.join(SESSION_DIR, file);
			const stat = fs.statSync(filePath);
			const raw = fs.readFileSync(filePath, 'utf8');
			let data;
			try {
				data = JSON.parse(raw);
			} catch (e) {
				continue; // skip malformed files
			}
			const turnCount = (data.turns || []).length;
			const firstPrompt = turnCount > 0 ? data.turns[0].prompt : '(no prompt)';
			sessions.push({
				name: data.sessionName || file.replace('.json', ''),
				createdAt: data.createdAt || stat.birthtime.toISOString(),
				updatedAt: data.updatedAt || stat.mtime.toISOString(),
				turnCount,
				promptPreview: firstPrompt.length > 60 ? firstPrompt.slice(0, 57) + '...' : firstPrompt,
				sizeBytes: stat.size,
			});
		}
		// Sort by updatedAt descending (most recent first)
		sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
		return sessions;
	};

	const deleteSession = (name) => {
		const filePath = path.join(SESSION_DIR, `${name}.json`);
		if (!fs.existsSync(filePath)) {
			throw new Error(`Session not found: "${name}". Use -listSessions to see available sessions.`);
		}
		fs.unlinkSync(filePath);
	};

	const renameSession = (oldName, newName) => {
		const oldPath = path.join(SESSION_DIR, `${oldName}.json`);
		const newPath = path.join(SESSION_DIR, `${newName}.json`);
		if (!fs.existsSync(oldPath)) {
			throw new Error(`Session not found: "${oldName}". Use -listSessions to see available sessions.`);
		}
		if (fs.existsSync(newPath)) {
			throw new Error(`A session named "${newName}" already exists.`);
		}
		const raw = fs.readFileSync(oldPath, 'utf8');
		const data = JSON.parse(raw);
		data.sessionName = newName;
		data.updatedAt = new Date().toISOString();
		fs.writeFileSync(newPath, JSON.stringify(data, null, 2), 'utf8');
		fs.unlinkSync(oldPath);
	};

	const buildSessionContext = (session) => {
		const lines = [];
		lines.push(`=== PRIOR RESEARCH SESSION: ${session.sessionName} ===`);
		lines.push('');

		for (const turn of (session.turns || [])) {
			lines.push(`--- Turn ${turn.turnNumber} ---`);
			lines.push(`PROMPT: ${turn.prompt}`);
			lines.push('');

			if (turn.turnType === 'interrogation' || turn.turnType === 'singleCall') {
				const label = turn.turnType === 'singleCall' && turn.promptName
					? `RESPONSE (${turn.promptName})`
					: turn.turnType === 'interrogation'
						? 'INTERROGATION RESPONSE'
						: 'RESPONSE';
				lines.push(`${label}: ${turn.response}`);
				lines.push('');
			} else {
				if (turn.perspectives && turn.perspectives.length > 0) {
					lines.push('PERSPECTIVES:');
					turn.perspectives.forEach((p, idx) => {
						lines.push(`${idx + 1}. [${p.perspective}]: ${p.findings}`);
					});
					lines.push('');
				}

				if (turn.synthesis && turn.synthesis.text) {
					lines.push(`SYNTHESIS: ${turn.synthesis.text}`);
					lines.push('');
				}
			}
		}

		return lines.join('\n');
	};

	const buildTurnFromResults = ({ originalPrompt, instructions, results, expandCost, synthesis, synthesisCost, elapsedSeconds, turnNumber }) => {
		const turn = {
			turnNumber,
			prompt: originalPrompt,
			expansion: {
				instructions: (instructions || []).map(i => ({
					id: i.id,
					perspective: i.perspective,
					instruction: i.instruction,
					methodology: i.methodology || '',
				})),
				cost: expandCost || { inputTokens: 0, outputTokens: 0, usd: 0 },
			},
			perspectives: (results || []).map(r => ({
				id: r.id,
				perspective: r.perspective,
				findings: r.findings,
				cost: r.cost || { inputTokens: 0, outputTokens: 0, usd: 0 },
			})),
			totalCost: {
				usd: (expandCost ? expandCost.usd : 0) +
					(results ? results.reduce((s, r) => s + r.cost.usd, 0) : 0) +
					(synthesisCost ? synthesisCost.usd : 0),
				inputTokens: (expandCost ? expandCost.inputTokens : 0) +
					(results ? results.reduce((s, r) => s + r.cost.inputTokens, 0) : 0) +
					(synthesisCost ? synthesisCost.inputTokens : 0),
				outputTokens: (expandCost ? expandCost.outputTokens : 0) +
					(results ? results.reduce((s, r) => s + r.cost.outputTokens, 0) : 0) +
					(synthesisCost ? synthesisCost.outputTokens : 0),
			},
			elapsedSeconds,
			timestamp: new Date().toISOString(),
		};

		if (synthesis) {
			turn.synthesis = {
				text: synthesis,
				cost: synthesisCost || { inputTokens: 0, outputTokens: 0, usd: 0 },
			};
		}

		return turn;
	};

	const createNewSession = ({ sessionName, commandLineParameters, config, turn }) => {
		return {
			sessionName,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			promptConfig: {
				firstPromptName: config.firstPromptName,
				perspectives: config.perspectives,
				summarize: config.summarize || false,
			},
			commandLineParameters: {
				switches: commandLineParameters.switches || {},
				values: commandLineParameters.values || {},
			},
			config: {
				expandModel: config.expandModel,
				agentModel: config.agentModel,
				driver: config.driver,
				perspectives: config.perspectives,
			},
			turns: [turn],
			totalCost: turn.totalCost,
		};
	};

	const appendTurnToSession = (session, turn) => {
		session.turns.push(turn);
		session.totalCost = {
			usd: session.turns.reduce((s, t) => s + (t.totalCost ? t.totalCost.usd : 0), 0),
		};
		return session;
	};

	return {
		ensureSessionDir,
		generateSessionName,
		saveSession,
		loadSession,
		listSessions,
		deleteSession,
		renameSession,
		buildSessionContext,
		buildTurnFromResults,
		createNewSession,
		appendTurnToSession,
	};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName })({});
