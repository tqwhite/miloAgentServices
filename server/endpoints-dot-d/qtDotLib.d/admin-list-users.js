#!/usr/bin/env node
'use strict';

/**
 * ENDPOINT: ADMIN USER LIST
 * 
 * This endpoint provides HTTP interface for administrative user listing.
 * Only users with admin or super privileges can list users.
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
		// STEP 2: EXTRACT REQUEST PARAMETERS

		taskList.push((args, next) => {
			// Extract query parameters for filtering/sorting
			const requestData = {
				role: xReq.qtGetSurePath('query.role', null),
				sortBy: xReq.qtGetSurePath('query.sortBy', 'username'),
				sortOrder: xReq.qtGetSurePath('query.sortOrder', 'asc'),
				activeOnly: xReq.qtGetSurePath('query.activeOnly', true)
			};

			next('', { ...args, requestData });
		});

		// --------------------------------------------------------------------------------
		// STEP 3: LIST USERS VIA ACCESS POINT

		taskList.push((args, next) => {
			const { accessPointsDotD, requestData } = args;

			const localCallback = (err, result) => {
				if (err) {
					next(`User listing failed: ${err}`, args);
					return;
				}
				next('', { ...args, result });
			};

			accessPointsDotD['admin-list-users'](requestData, localCallback);
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
				xLog.error(`Admin user listing error (${errorId}): ${err}`);
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

	const method = 'get';
	const thisEndpointName = 'adminListUsers';
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