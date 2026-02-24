#!/usr/bin/env node
'use strict';

/**
 * ENDPOINT: CHORUS STUDY STATUS
 *
 * GET /api/chorusStudyStatus?sessionName=X&turnNumber=N
 *
 * Returns the status of a previously submitted chorus study.
 * Reads the session file and reports: running, complete, or error.
 *
 * Permission: public (no payment required — status checks are free)
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
	const { xLog, getConfig, commandLineParameters } = process.global;
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
		// PIPELINE STAGE 2: CALL CHORUS-STUDY-STATUS ACCESS POINT

		taskList.push((args, next) => {
			const { accessPointsDotD, requestBody } = args;

			const localCallback = (err, { statusResult } = {}) => {
				if (err) {
					next(err, args);
					return;
				}
				next('', { ...args, statusResult });
			};

			accessPointsDotD['chorus-study-status'](requestBody, localCallback);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE EXECUTION AND HTTP RESPONSE

		const requestBody = {
			sessionName: xReq.qtGetSurePath('query.sessionName', ''),
			turnNumber: xReq.qtGetSurePath('query.turnNumber', '0'),
		};
		const initialData = { accessPointsDotD, requestBody, permissionValidator };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			const { statusResult } = args;

			if (err) {
				const errorId = `Q${Math.random().toString().slice(2, 18)}`;
				xLog.error(`chorusStudyStatus error: ${err} (${errorId})`);
				xRes.status(500).send(`${err.toString()} (${errorId})`);
				return;
			}

			xRes.send(Array.isArray(statusResult) ? statusResult : [statusResult]);
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

	const method = 'get';
	const thisEndpointName = 'chorusStudyStatus';
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
