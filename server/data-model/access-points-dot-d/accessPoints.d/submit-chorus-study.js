#!/usr/bin/env node
'use strict';

/**
 * ACCESS POINT: SUBMIT CHORUS STUDY
 *
 * Spawns askMilo as a detached child process and returns immediately
 * with a session name and turn number. The caller polls the status
 * endpoint to check for completion.
 *
 * Key differences from ask-the-chorus.js:
 *   - Spawns detached (does not wait for askMilo to finish)
 *   - Does NOT pass noSave (askMilo will write a session file)
 *   - Passes a server-generated sessionName to askMilo
 *   - Returns immediately with { status: "accepted", sessionName, turnNumber, ... }
 *   - Tracks in-flight sessions to prevent concurrent turns on same session
 *   - Writes error session file if askMilo crashes (via child.on('close'))
 */

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const sessionManager = require('../../lib/ask-milo-multitool/lib/sessionManager');

const SESSION_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'askMilo', 'sessions');

// Module-level Set to track sessions with pending turns
const inFlightSessions = new Set();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig, commandLineParameters } = process.global;

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (requestBody, callback) => {
		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 1: VALIDATE INPUT AND DETERMINE SESSION/TURN

		taskList.push((args, next) => {
			const { requestBody } = args;

			const fileList = requestBody.qtGetSurePath('fileList', []);
			if (!fileList.length) {
				next('Missing prompt: fileList must contain at least one element', args);
				return;
			}

			// Determine session name and turn number
			const providedSessionName = requestBody.qtGetSurePath('values.sessionName', [undefined])[0];

			let sessionName;
			let turnNumber;

			if (providedSessionName) {
				// Multi-turn: check existing file for turn count
				sessionName = providedSessionName;
				const sessionFilePath = path.join(SESSION_DIR, `${sessionName}.json`);
				if (fs.existsSync(sessionFilePath)) {
					try {
						const existing = sessionManager.loadSession(sessionName);
						turnNumber = (existing.turns || []).length + 1;
					} catch (loadErr) {
						// File exists but can't be read — treat as turn 1
						xLog.error(`Could not load existing session ${sessionName}: ${loadErr.message}`);
						turnNumber = 1;
					}
				} else {
					turnNumber = 1;
				}
			} else {
				sessionName = sessionManager.generateSessionName();
				turnNumber = 1;
			}

			next('', { ...args, fileList, sessionName, turnNumber });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: CHECK IN-FLIGHT PROTECTION

		taskList.push((args, next) => {
			const { sessionName } = args;

			if (inFlightSessions.has(sessionName)) {
				next(`Session "${sessionName}" already has a turn in progress`, args);
				return;
			}

			inFlightSessions.add(sessionName);
			next('', args);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 3: SPAWN ASKMILO DETACHED

		taskList.push((args, next) => {
			const { requestBody, fileList, sessionName, turnNumber } = args;

			// Build askMilo input — NO noSave, WITH sessionName
			const askMiloInput = {
				switches: {
					...requestBody.qtGetSurePath('switches', {}),
					json: true,
					// NO noSave — we want the session file written
				},
				values: {
					...requestBody.qtGetSurePath('values', {}),
					sessionName: [sessionName],
				},
				fileList: fileList,
			};

			const askMiloPath = path.join(
				__dirname,
				'../../lib/ask-milo-multitool/askMilo.js',
			);

			const child = spawn('node', [askMiloPath], {
				cwd: path.dirname(askMiloPath),
				stdio: ['pipe', 'ignore', 'pipe'],
				detached: true,
			});

			let stderrBuffer = '';
			child.stderr.on('data', (chunk) => {
				stderrBuffer += chunk.toString();
			});

			child.on('close', (code) => {
				inFlightSessions.delete(sessionName);
				if (code !== 0) {
					// Write error session file for status endpoint to find
					fs.mkdirSync(SESSION_DIR, { recursive: true });
					const errorSession = {
						sessionName,
						status: 'error',
						error: `askMilo exited with code ${code}: ${stderrBuffer.slice(0, 2000)}`,
						failedAt: new Date().toISOString(),
						turns: [],
					};
					fs.writeFileSync(
						path.join(SESSION_DIR, `${sessionName}.json`),
						JSON.stringify(errorSession, null, 2),
					);
					xLog.error(`askMilo failed for session ${sessionName}: exit code ${code}`);
				} else {
					xLog.status(`askMilo completed for session ${sessionName}`);
				}
			});

			child.on('error', (spawnErr) => {
				inFlightSessions.delete(sessionName);
				xLog.error(`Failed to spawn askMilo for ${sessionName}: ${spawnErr.message}`);
			});

			// Send input and detach
			child.stdin.write(JSON.stringify(askMiloInput));
			child.stdin.end();
			child.unref();

			// Return immediately — do not wait for askMilo
			const perspectives = parseInt(requestBody.qtGetSurePath('values.perspectives', ['3'])[0]) || 3;
			const estimatedSeconds = perspectives * 120;

			const submitResult = {
				status: 'accepted',
				sessionName,
				turnNumber,
				checkUrl: `/api/chorusStudyStatus?sessionName=${encodeURIComponent(sessionName)}&turnNumber=${turnNumber}`,
				estimatedSeconds,
				pollAdvice: 'Wait 5 minutes before first check, then every 60 seconds.',
			};

			next('', { ...args, submitResult });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE EXECUTION

		const initialData = { requestBody };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			const { submitResult } = args;

			if (err) {
				callback(err, {});
				return;
			}

			callback('', { submitResult });
		});
	};

	// ================================================================================
	// REGISTRATION

	const addEndpoint = ({ name, serviceFunction, dotD }) => {
		dotD.logList.push(name);
		dotD.library.add(name, serviceFunction);
	};

	const name = moduleName;
	addEndpoint({ name, serviceFunction, dotD });

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
