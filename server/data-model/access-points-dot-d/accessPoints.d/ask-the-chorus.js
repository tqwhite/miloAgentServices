#!/usr/bin/env node
'use strict';

/**
 * ACCESS POINT: ASK THE CHORUS
 *
 * Spawns the askMilo CLI as a child process with JSON on stdin.
 * Treats askMilo like a database call: send query, get structured results.
 *
 * askMilo handles its own config loading (askMilo.ini) and process.global setup.
 * We just need to pass it the right JSON input and collect its JSON output.
 */

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const path = require('path');
const { spawn } = require('child_process');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;

	const { sqlDb, hxAccess, dataMapping } = passThroughParameters;

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (requestBody, callback) => {
		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 1: VALIDATE AND BUILD ASKMILO INPUT

		taskList.push((args, next) => {
			const { requestBody } = args;

			// The request body IS the askMilo JSON format:
			// { switches: {}, values: {}, fileList: ["the prompt"] }
			// We validate that fileList has at least one element (the prompt).

			const fileList = requestBody.qtGetSurePath('fileList', []);
			if (!fileList.length) {
				next('Missing prompt: fileList must contain at least one element', args);
				return;
			}

			// Force -json and -noSave — the server owns output formatting and sessions
			const askMiloInput = {
				switches: {
					...requestBody.qtGetSurePath('switches', {}),
					json: true,
					noSave: true,
				},
				values: requestBody.qtGetSurePath('values', {}),
				fileList: fileList,
			};

			next('', { ...args, askMiloInput });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: SPAWN ASKMILO AND COLLECT OUTPUT

		taskList.push((args, next) => {
			const { askMiloInput } = args;

			const askMiloPath = path.join(
				__dirname,
				'../../lib/ask-milo-multitool/askMilo.js',
			);

			const childProcess = spawn('node', [askMiloPath], {
				cwd: path.dirname(askMiloPath),
				stdio: ['pipe', 'pipe', 'pipe'],
			});

			let stdoutData = '';
			let stderrData = '';

			childProcess.stdout.on('data', (chunk) => {
				stdoutData += chunk.toString();
			});

			childProcess.stderr.on('data', (chunk) => {
				stderrData += chunk.toString();
			});

			childProcess.on('close', (exitCode) => {
				if (exitCode !== 0) {
					xLog.error(`askMilo exited with code ${exitCode}: ${stderrData}`);
					next(`askMilo failed: ${stderrData.slice(0, 500)}`, args);
					return;
				}

				// askMilo with -json outputs JSON to stdout (via xLog.result which goes to stdout)
				// stderr may contain status messages (via xLog.status which goes to stderr)
				let parsedResult;
				try {
					parsedResult = JSON.parse(stdoutData);
				} catch (parseErr) {
					xLog.error(`Failed to parse askMilo output: ${parseErr.message}`);
					xLog.error(`Raw output (first 500 chars): ${stdoutData.slice(0, 500)}`);
					next(`askMilo returned unparseable output`, args);
					return;
				}

				next('', { ...args, chorusResult: parsedResult });
			});

			childProcess.on('error', (spawnErr) => {
				next(`Failed to spawn askMilo: ${spawnErr.message}`, args);
			});

			// Send JSON input on stdin and close
			childProcess.stdin.write(JSON.stringify(askMiloInput));
			childProcess.stdin.end();
		});

		// --------------------------------------------------------------------------------
		// PIPELINE EXECUTION

		const initialData = { requestBody };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			const { chorusResult } = args;

			if (err) {
				callback(err, {});
				return;
			}

			callback('', { chorusResult });
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
