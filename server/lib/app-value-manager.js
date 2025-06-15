#!/usr/bin/env node
'use strict';

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, ''); //this just seems to come in handy a lot

// const qt = require('qtools-functional-library'); //also exposes qtLog(); qt.help({printOutput:true, queryString:'.*', sendJson:false});

const os = require('os');
const path = require('path');
const fs = require('fs');

//START OF moduleFunction() ============================================================
const moduleFunction =
	({ moduleName } = {}) =>
	({ targetObject }) => {
		const { xLog, getConfig, rawConfig, commandLineParameters } =
			process.global;
		const localConfig = getConfig(moduleName); //moduleName is closure
		

		const appValueSetter = function (key, value) {
			this.applicationValues[key] = value;
		};

		const appValueGetter = function (key) {
			return this.applicationValues[key];
		};

		const appValuesToLog = function () {
			const list = Object.keys(this.applicationValues).map(
				(name) => `    ${name}=${this.applicationValues[name]}`,
			);
			xLog.status(`applicationValues:\n${list.join('\n')}`);
		};


			targetObject.applicationValues = targetObject.applicationValues
				? targetObject.applicationValues
				: {};
			Object.assign(targetObject, {appValueSetter, appValueGetter, appValuesToLog});
		return {};
	};

//END OF moduleFunction() ============================================================


module.exports = moduleFunction({ moduleName });

