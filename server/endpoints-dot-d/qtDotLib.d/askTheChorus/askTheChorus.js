#!/usr/bin/env node
'use strict';

/**
 * ENDPOINT: ASK THE CHORUS
 *
 * POST /api/askTheChorus
 *
 * Accepts the askMilo JSON format in the request body:
 *   { switches: {}, values: {}, fileList: ["your prompt"] }
 *
 * Delegates to the ask-the-chorus access point which spawns askMilo
 * as a child process. Returns the structured JSON result.
 *
 * Permission: public (x402 payment gating comes later)
 */

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({
	dotD: endpointsDotD,
	passThroughParameters,
}) {
	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(moduleName);

	const {
		expressApp,
		accessTokenHeaderTools,
		accessPointsDotD,
		routingPrefix,
	} = passThroughParameters;

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (permissionValidator) => (xReq, xRes, next) => {
		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 1: PERMISSION VALIDATION

		taskList.push((args, next) =>
			args.permissionValidator(
				xReq.appValueGetter('authclaims'),
				forwardArgs({ next, args }),
			),
		);

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: CALL ASK-THE-CHORUS ACCESS POINT

		taskList.push((args, next) => {
			const { accessPointsDotD, requestBody } = args;

			const localCallback = (err, { chorusResult } = {}) => {
				if (err) {
					next(err, args);
					return;
				}
				next('', { ...args, chorusResult });
			};

			accessPointsDotD['ask-the-chorus'](requestBody, localCallback);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE EXECUTION AND HTTP RESPONSE

		const requestBody = xReq.body || {};
		const initialData = { accessPointsDotD, requestBody, permissionValidator };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			const { chorusResult } = args;

			if (err) {
				const errorId = `Q${Math.random().toString().slice(2, 18)}`;
				xLog.error(`askTheChorus error: ${err} (${errorId})`);
				xRes.status(500).send(`${err.toString()} (${errorId})`);
				return;
			}

			xRes.send(Array.isArray(chorusResult) ? chorusResult : [chorusResult]);
		});
	};

	// ================================================================================
	// ENDPOINT REGISTRATION

	const addEndpoint = ({
		name,
		method,
		routePath,
		serviceFunction,
		expressApp,
		endpointsDotD,
		permissionValidator,
	}) => {
		expressApp[method](routePath, serviceFunction(permissionValidator));
		endpointsDotD.logList.push(name);
	};

	const method = 'post';
	const thisEndpointName = 'askTheChorus';
	const routePath = `${routingPrefix}${thisEndpointName}`;
	const name = routePath;

	const permissionValidator = accessTokenHeaderTools.getValidator(['public']);
	addEndpoint({
		name,
		method,
		routePath,
		serviceFunction,
		expressApp,
		endpointsDotD,
		permissionValidator,
	});

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
