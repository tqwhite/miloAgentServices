#!/usr/bin/env node
'use strict';

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, ''); //this just seems to come in handy a lot
const qt = require('qtools-functional-library');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	// SYSTEM INIT ---------------------------------
	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(moduleName); //moduleName is closure

	const {
		expressApp,
		accessTokenHeaderTools,
		accessPointsDotD,
		routingPrefix,
	} = passThroughParameters;
	

	const method = 'get';
	const serviceFunction = permissionValidator=>(xReq, xRes, next) => {
		xRes.send(`hello from ${moduleName}`);
	};
	

	const thisEndpointName = 'ping';
	const routePath = `${routingPrefix}${thisEndpointName}`;
	const name = routePath;
	

	const addEndpoint = ({
		name,
		method,
		routePath,
		serviceFunction,
		expressApp,
		dotD,
		permissionValidator,
	}) => {
		

		expressApp[method](routePath, serviceFunction(permissionValidator));
		dotD.logList.push(name);
		
	};

	const permissionValidator = accessTokenHeaderTools.getValidator(['public']);
	addEndpoint({
		name,
		method,
		routePath,
		serviceFunction,
		expressApp,
		dotD,
		permissionValidator,
	});
	

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
