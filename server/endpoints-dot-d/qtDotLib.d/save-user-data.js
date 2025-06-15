#!/usr/bin/env node
'use strict';

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, ''); //this just seems to come in handy a lot
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
	const localConfig = getConfig(moduleName); //moduleName is closure

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
		// TASKLIST ITEM TEMPLATE

		// 		taskList.push((args, next) => {
		// 			const claims = xReq.appValueGetter('authclaims');
		// 			console.log(
		// 				`\n=-=============   claims  ========================= [save-user-data.js.moduleFunction]\n`,
		// 			);
		//
		//
		// 			console.dir(
		// 				{ ['claims']: claims },
		// 				{ showHidden: false, depth: 4, colors: true },
		// 			);
		//
		// 			console.log(
		// 				`\n=-=============   claims  ========================= [save-user-data.js.moduleFunction]\n`,
		// 			);
		//
		//
		// 			next('', args);
		// 		});

		// --------------------------------------------------------------------------------
		// TASKLIST ITEM TEMPLATE

		taskList.push((args, next) =>
			args.permissionValidator(
				xReq.appValueGetter('authclaims'),
				{ showDetails: true },
				forwardArgs({ next, args }),
			),
		);

		// --------------------------------------------------------------------------------
		// TASKLIST ITEM TEMPLATE

		taskList.push((args, next) => {
			const { accessPointsDotD } = args;

			const localCallback = (err, user) => {
				if (err) {
					next(`$[err.toString()}  (Q11120246254062540030)`, args); //next('skipRestOfPipe', args);
					return;
				}
				next(err, { ...args, user });
			};
			const revisedUser = xReq.body.qtClone();
			revisedUser.role = revisedUser.role
				.split(/,/)
				.filter((item) => item != 'firstTime')
				.join(',');
			accessPointsDotD['user-save-data'](revisedUser, localCallback);
		});

		// --------------------------------------------------------------------------------
		// TASKLIST ITEM TEMPLATE

		taskList.push((args, next) => {
			const { user, accessTokenHeaderTools } = args;

			const localCallback = (err) => {
				if (err) {
					next(`$[err.toString()}  (Q14620245330253302478)`, args); //next('skipRestOfPipe', args);
					return;
				}
				next('', args); //next('', {...args, NAME:result});
			};

			//this is the only endpoint that allows the role, firstTime, and it always deletes it.
			accessTokenHeaderTools.refreshauthtoken(
				{
					xReq,
					xRes,
					payloadValues: {
						source: 'save-user-data',
						user,
					},
				},
				localCallback,
			);
		});

		// --------------------------------------------------------------------------------
		// INIT AND EXECUTE THE PIPELINE

		const initialData = {
			accessPointsDotD,
			permissionValidator,
			accessTokenHeaderTools,
		};
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			const { user } = args;

			if (err) {
				xRes.status(500).send(`${err.toString()}`);
				return;
			}

			xRes.send([{ refID: user.refId }]);
		});
	};

	// ================================================================================
	// Endpoint Constructor

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
		expressApp[method](routePath, serviceFunction(permissionValidator)); //uaw expressApp instead of dotD.library
		endpointsDotD.logList.push(name);
	};

	// ================================================================================
	// Do the constructing

	const method = 'post';
	const thisEndpointName = 'saveUserData';
	const routePath = `${routingPrefix}${thisEndpointName}`;
	const name = routePath;

	const permissionValidator = accessTokenHeaderTools.getValidator([
		'client',
		'admin',
		'super',
		'firstTime',
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
