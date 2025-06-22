#!/usr/bin/env node
'use strict';

/**
 * ENDPOINT: ADMIN USER CREATION
 * 
 * This endpoint provides HTTP interface for administrative user creation.
 * Only users with admin or super privileges can create new users.
 * 
 * SECURITY:
 * - Requires 'admin' or 'super' role permissions
 * - All input validation handled by access point
 * - Passwords never returned to client
 * - Comprehensive error handling with tracking IDs
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
	// ================================================================================
	// INITIALIZATION

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
		// STEP 1: PERMISSION VALIDATION (SECURITY FIRST)

		taskList.push((args, next) =>
			args.permissionValidator(
				xReq.appValueGetter('authclaims'),
				{ showDetails: false },
				forwardArgs({ next, args }),
			),
		);

		// --------------------------------------------------------------------------------
		// STEP 2: EXTRACT AND VALIDATE REQUEST DATA

		taskList.push((args, next) => {
			// Extract user data from request body
			const userData = xReq.qtGetSurePath('body', {});
			
			// Basic request validation
			if (!userData || Object.keys(userData).length === 0) {
				next('Request body is required', args);
				return;
			}

			next('', { ...args, userData });
		});

		// --------------------------------------------------------------------------------
		// STEP 3: CREATE USER VIA ACCESS POINT

		taskList.push((args, next) => {
			const { accessPointsDotD, userData } = args;

			const localCallback = (err, result) => {
				if (err) {
					next(`User creation failed: ${err}`, args);
					return;
				}
				next('', { ...args, result });
			};

			accessPointsDotD['admin-create-user'](userData, localCallback);
		});

		// --------------------------------------------------------------------------------
		// EXECUTE PIPELINE AND HANDLE RESPONSE

		const initialData = {
			accessPointsDotD,
			permissionValidator,
			accessTokenHeaderTools,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				const errorId = qt.generateShortId();
				xLog.error(`Admin user creation error (${errorId}): ${err}`);
				xRes.status(400).send(`${err.toString()} (${errorId})`);
				return;
			}

			const { result } = args;
			
			// Always return array for consistent client handling
			xRes.send(Array.isArray(result) ? result : [result]);
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
		accessTokenHeaderTools,
	}) => {
		expressApp[method](routePath, serviceFunction(permissionValidator));
		endpointsDotD.logList.push(name);
	};

	// ================================================================================
	// ENDPOINT CONFIGURATION

	const method = 'post';
	const thisEndpointName = 'adminCreateUser';
	const routePath = `${routingPrefix}${thisEndpointName}`;
	const name = routePath;

	// Require admin or super privileges
	const permissionValidator = accessTokenHeaderTools.getValidator([
		'admin',
		'super',
	]);

	addEndpoint({
		name,
		method,
		routePath,
		serviceFunction,
		expressApp,
		endpointsDotD,
		permissionValidator,
		accessTokenHeaderTools,
	});

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;