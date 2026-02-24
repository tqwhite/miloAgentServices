#!/usr/bin/env node
'use strict';

/**
 * ACCESS POINT: CHORUS STUDY STATUS
 *
 * Reads a session file from the askMilo sessions directory and returns
 * structured status information. Pure filesystem reads — no child processes.
 *
 * Status logic:
 *   - File not found → { status: "running", completedTurns: 0 }
 *   - File found, session.status === "error" → { status: "error", message }
 *   - File found, turns.length >= turnNumber → { status: "complete", result }
 *   - File found, turns.length < turnNumber → { status: "running", completedTurns }
 *   - Parse error → { status: "error", message: "corrupt session file" }
 */

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const os = require('os');
const path = require('path');
const fs = require('fs');

const SESSION_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'askMilo', 'sessions');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig, commandLineParameters } = process.global;

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (requestBody, callback) => {
		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 1: VALIDATE INPUT

		taskList.push((args, next) => {
			const { requestBody } = args;

			const sessionName = requestBody.qtGetSurePath('sessionName', '');
			const turnNumber = parseInt(requestBody.qtGetSurePath('turnNumber', '0'));

			if (!sessionName) {
				next('Missing required parameter: sessionName', args);
				return;
			}

			if (!turnNumber || turnNumber < 1) {
				next('Missing or invalid parameter: turnNumber (must be >= 1)', args);
				return;
			}

			next('', { ...args, sessionName, turnNumber });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: CHECK SESSION FILE AND BUILD STATUS

		taskList.push((args, next) => {
			const { sessionName, turnNumber } = args;

			const sessionFilePath = path.join(SESSION_DIR, `${sessionName}.json`);

			// File not found — session is still running (no output yet)
			if (!fs.existsSync(sessionFilePath)) {
				const statusResult = {
					status: 'running',
					sessionName,
					expectedTurn: turnNumber,
					completedTurns: 0,
				};
				next('', { ...args, statusResult });
				return;
			}

			// File exists — read and parse
			let sessionData;
			try {
				const raw = fs.readFileSync(sessionFilePath, 'utf8');
				sessionData = JSON.parse(raw);
			} catch (parseErr) {
				xLog.error(`Corrupt session file for ${sessionName}: ${parseErr.message}`);
				const statusResult = {
					status: 'error',
					sessionName,
					message: 'corrupt session file',
				};
				next('', { ...args, statusResult });
				return;
			}

			// Check for error status (written by submit endpoint on askMilo crash)
			if (sessionData.status === 'error') {
				const statusResult = {
					status: 'error',
					sessionName,
					message: sessionData.error || 'unknown error',
				};
				next('', { ...args, statusResult });
				return;
			}

			const turns = sessionData.turns || [];

			// Turn complete — return result
			if (turns.length >= turnNumber) {
				const statusResult = {
					status: 'complete',
					sessionName,
					turnNumber,
					result: turns[turnNumber - 1],
				};
				next('', { ...args, statusResult });
				return;
			}

			// Turn not yet complete — still running
			const statusResult = {
				status: 'running',
				sessionName,
				expectedTurn: turnNumber,
				completedTurns: turns.length,
			};
			next('', { ...args, statusResult });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE EXECUTION

		const initialData = { requestBody };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			const { statusResult } = args;

			if (err) {
				callback(err, {});
				return;
			}

			callback('', { statusResult });
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
