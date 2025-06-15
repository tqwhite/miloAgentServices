#!/usr/bin/env node
'use strict';

/**
 * SYSTEM ORCHESTRATION PIPELINE
 * 
 * This module orchestrates the entire application startup through a sequential
 * pipeline that ensures dependencies are loaded in the correct order:
 * 1. Data layer (database, access points, mappers) 
 * 2. Authentication middleware (token validation/refresh)
 * 3. Host-specific configuration
 * 4. Dynamic endpoint loading
 * 
 * ARCHITECTURE DECISIONS:
 * - Uses qtools-asynchronous-pipe-plus instead of async/await for shared state
 *   accumulation, clear error propagation, and sequential dependency loading
 * - Configuration-driven: Everything controlled by INI files for environment flexibility
 * - Uses qtSelectProperties() to pass only needed data between pipeline stages
 * - Graceful error handling with detailed logging and clean exit strategies
 */

// Suppress punycode deprecation warning
// process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, ''); //this just seems to come in handy a lot

const qt = require('qtools-functional-library');

const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const os = require('os');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const querystring = require('querystring');

// --------------------------------------------------------------------------------
// OTHER MODULES
//START OF moduleFunction() ============================================================

const moduleFunction =
	({ moduleName }) =>
	(err, { rawConfig, commandLineParameters, getConfig }) => {
		// ======================================================================================
		// CONFIGURATION INITIALIZATION
		// 
		// EXPLANATION: Sets up the global configuration system that all modules use.
		// The configuration is loaded from INI files and processed with token substitution.
		// 
		// TO ADD NEW CONFIGURATION: Add to systemParameters.ini under [startApiServer] section,
		// then destructure from getConfig(moduleName) around line 65.

		process.global.getConfig = getConfig;
		process.global.commandLineParameters = commandLineParameters;
		process.global.rawConfig = rawConfig; //this should only be used for debugging, use getConfig(moduleName)

		const { xLog } = process.global;

		xLog.status(
			`Using config: ${getConfig('_meta').configurationSourceFilePath}`,
		);
		const {
			apiPort,
			staticDirectoryPath,
			staticPathPrefix,
			allowQueryStringInLog,
			suppressPictureRequestLogging,
		} = getConfig(moduleName);

		if (suppressPictureRequestLogging) {
			xLog.status(
				`image requests are NOT being logged, suppressPictureRequestLogging=${suppressPictureRequestLogging}`,
			);
		} else {
			xLog.status(
				`image requests are being logged, suppressPictureRequestLogging=${suppressPictureRequestLogging}`,
			);
		}

		// ======================================================================================
		// EXPRESS APPLICATION SETUP
		// 
		// EXPLANATION: Configures Express with logging middleware, body parsing, and static routes.
		// Request logging is configurable and can exclude image requests for cleaner logs.
		// 
		// TO ADD NEW EXPRESS MIDDLEWARE: Add it here before the DYNAMIC ENDPOINTS section.
		// TO ADD NEW STATIC ROUTES: Add after line 112 (static endpoints section).

		const expressApp = express();

		expressApp.use((xReq, xRes, next) => {
			if (suppressPictureRequestLogging && xReq.path.match(/\/api\/image\//)) {
				next();
				return;
			}
			const queryString =
				allowQueryStringInLog && Object.keys(xReq.query).length
					? '?' + querystring.stringify(xReq.query)
					: '';
			console.log(
				`Request: ${xReq.method.toUpperCase()} ${xReq.path}${queryString} via nginx/${xReq.headers['tq-config-id']} [startApiServer.js]`,
			);
			next();
		});

		expressApp.use(bodyParser.json({ extended: true })); //https://stackabuse.com/get-http-post-body-in-express-js/

		// --------------------------------------------------------------------------------
		//STATIC ENDPOINTS

		expressApp.use(/\/api\/ping/, (xReq, xRes, next) => {
			xLog.status(`xReq.path=${xReq.path} [startApiServer.js]`);
			next();
		});

		console.log(`staticDirectoryPath=${staticDirectoryPath}`);

		xLog.status(`using image directory ${staticDirectoryPath}`);
		expressApp.use(staticPathPrefix, express.static(staticDirectoryPath));

		// --------------------------------------------------------------------------------
		// SYSTEM INITIALIZATION PIPELINE
		// 
		// EXPLANATION: Sequential pipeline loads system components in dependency order.
		// Each stage receives accumulated args from previous stages and adds its outputs.
		// Uses qtools-asynchronous-pipe-plus for shared state and error propagation.
		// 
		// TO ADD NEW PIPELINE STAGES: Add new taskList.push() items before line 200 (INIT AND EXECUTE).
		// TO DEBUG PIPELINE: Add xLog.debug(args, { label: 'Stage Name' }) at start of stages.

		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 1: DATA MODEL INITIALIZATION
		// 
		// EXPLANATION: Loads database, access points, and data mappers. This must be first
		// because all other stages depend on the data layer being available.
		// 
		// OUTPUTS: accessPointsDotD, dataModelLogInfoList

		taskList.push((args, next) => {
			const localCallback = (
				err,
				{ accessPointsDotD, dataModelLogInfoList },
			) => {
				if (err) {
					next(err, args); //next('skipRestOfPipe', args);
					return;
				}

				next('', { ...args, accessPointsDotD, dataModelLogInfoList });
			};

			require('./data-model')(
				args.qtSelectProperties(['expressApp']),
				localCallback,
			);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: AUTHENTICATION MIDDLEWARE SETUP
		// 
		// EXPLANATION: Sets up token validation and refresh middleware. Must come after
		// data model because it needs user access points. Adds middleware to Express
		// that validates tokens on each request and refreshes them when needed.
		// 
		// INPUTS: expressApp, accessPointsDotD
		// OUTPUTS: accessTokenHeaderTools
		// TO ADD NEW MIDDLEWARE: Add expressApp.use() calls in this stage.

		taskList.push((args, next) => {
			const { expressApp, accessPointsDotD } = args;
			accessPointsDotD.qtListProperties();
			const appValueManager = require('./lib/app-value-manager');
			const userByUsername = accessPointsDotD['user-by-username'];
			const accessTokenHeaderTools = require('./lib/access-token-header-tools')(
				{
					expressApp,
					userByUsername,
				},
			);

			expressApp.use((xReq, xRes, next) => {
				appValueManager({ targetObject: xReq });
				next();
			});

			expressApp.use((xReq, xRes, next) => {
				const localCallback = (err) => {
					if (err) {
						xRes.status(401).send(`Bad Request ${err.toString()}`);
						return; //this next is not asyncPipe
					}
					next(); // this next is expressApp.next()
				};
				accessTokenHeaderTools.hasValidToken(xReq, localCallback);
			});

			expressApp.use((xReq, xRes, next) => {
				accessTokenHeaderTools.refreshauthtoken({ xReq, xRes }, next); //updated by endpoint, if needed, eg, login
			});

			next('', { ...args, accessTokenHeaderTools });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 3: HOST PARAMETERS INITIALIZATION
		// 
		// EXPLANATION: Loads host-specific configuration parameters. This provides
		// environment-specific settings that may be needed by endpoints.
		// 
		// INPUTS: accessPointsDotD
		// OUTPUTS: result (host parameters)

		taskList.push((args, next) => {
			const { accessPointsDotD } = args;

			const localCallback = (err, result) => {
				if (err) {
					next(err, args); //next('skipRestOfPipe', args);
					return;
				}

				next('', { ...args, result });
			};

			accessPointsDotD['host-params'](localCallback);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 4: DYNAMIC ENDPOINT LOADING
		// 
		// EXPLANATION: Loads all endpoints from qtDotLib.d/ directory. This is the final
		// stage because endpoints may depend on all previous components. Uses dynamic
		// loading to automatically discover and register API routes.
		// 
		// INPUTS: expressApp, accessTokenHeaderTools, accessPointsDotD
		// OUTPUTS: endpointsDotD

		taskList.push((args, next) => {
			const localCallback = (err, endpointsDotD) => {
				if (err) {
					next(err, args); //next('skipRestOfPipe', args);
					return;
				}

				next('', { ...args, endpointsDotD });
			};

			require('./endpoints-dot-d')(
				args.qtSelectProperties([
					'expressApp',
					'accessTokenHeaderTools',
					'accessPointsDotD',
				]),
				localCallback,
			);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE EXECUTION
		// 
		// EXPLANATION: Executes the entire initialization pipeline. If any stage fails,
		// the server exits gracefully with detailed error information. On success,
		// displays startup information and starts listening on the configured port.

		const initialData = { expressApp };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			const { endpointsDotD, accessPointsDotD, dataModelLogInfoList } = args;

			if (err) {
				xLog.error(
					xLog.color.magentaBright(`
=================================================
FAILED TO START SERVER

${err.toString()}

=================================================

`),
				);
				process.exit(1);
			}
			xLog.status(dataModelLogInfoList.join('\n'));
			xLog.status(endpointsDotD.qtdProcessLog()); //console.dir(xpressApp._router.stack) for the real details

			xLog.status(accessPointsDotD.toString());

			//callback(err, {localResult1Value, localResult2});
		});

		// ======================================================================================
		// START SERVER

		expressApp.listen(apiPort);
		xLog.status(xLog.color.magentaBright(`\nMagic happens on ${apiPort}`));
	};
//END OF moduleFunction() ============================================================

// prettier-ignore
{
// --------------------------------------------------------------------------------
// BOOTSTRAP INITIALIZATION
// 
// EXPLANATION: This section runs when the module is loaded. It sets up the
// basic global utilities and configuration system before the main module function
// executes. The configuration system handles command line parsing, INI file
// loading, and help text generation.

// --------------------------------------------------------------------------------
// FIND PROJECT ROOT
const findProjectRoot=({rootFolderName='system', closest=true}={})=>__dirname.replace(new RegExp(`^(.*${closest?'':'?'}\/${rootFolderName}).*$`), "$1");
const projectRoot=findProjectRoot(); // call with {closest:false} if there are nested rootFolderName directories and you want the top level one

// --------------------------------------------------------------------------------
// GLOBAL UTILITIES SETUP
// 
// EXPLANATION: Sets up process.global with essential utilities that all modules
// need. xLog provides consistent logging, projectRoot provides path resolution.
process.global = {};
process.global.xLog = require('./lib/x-log');
process.global.xLog.logToStdOut();
process.global.projectRoot = projectRoot;

// --------------------------------------------------------------------------------
// CONFIGURATION SYSTEM BOOTSTRAP
// 
// EXPLANATION: Loads configuration from INI files, processes command line args,
// and calls the main module function. Handles --help and exits gracefully on
// configuration errors.
const assembleConfigurationShowHelpMaybeExit = require('./lib/assemble-configuration-show-help-maybe-exit');

assembleConfigurationShowHelpMaybeExit({ configName:moduleName, applicationControls:['-flagCity', '--flagValue'] }, moduleFunction({ moduleName }));

}

module.exports = moduleFunction({ moduleName });