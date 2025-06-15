#!/usr/bin/env node
'use strict';

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, ''); //this just seems to come in handy a lot
const qt = require('qtools-functional-library');

const os = require('os');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	// ================================================================================
	// INITIALIZATION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(moduleName); //moduleName is closure

	const { sqlDb, hxAccess, dataMapping } = passThroughParameters;

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (args, callback) => {
		if (typeof args == 'function') {
			callback = args;
			args = {};
		}

		callback('', {
			hostname: os.hostname(),
		});
	};

	// ================================================================================
	// Access Point Constructor

	const addEndpoint = ({ name, method, serviceFunction, dotD }) => {
		dotD.logList.push(name);
		dotD.library.add(name, serviceFunction);
	};

	// ================================================================================
	// Do the constructing

	const name = moduleName;

	addEndpoint({ name, serviceFunction, dotD });

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
