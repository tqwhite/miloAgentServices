#!/usr/bin/env node
'use strict';
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, ''); //this just seems to come in handy a lot

const path = require('path');
const fs = require('fs');

const {pipeRunner, taskListPlus, mergeArgs, forwardArgs} = new require('qtools-asynchronous-pipe-plus')();

//START OF moduleFunction() ============================================================
const moduleFunction = ({ expressApp, accessTokenHeaderTools, accessPointsDotD }, callback) => {
	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(moduleName); //moduleName is closure

	// ================================================================================
	// MAIN PROCESS

	const endpointsDotD = require('qtools-library-dot-d')({
		libraryName: 'Endpoints'
	});
	
	const taskList = new taskListPlus();

	// --------------------------------------------------------------------------------
	// TASKLIST ITEM TEMPLATE

	taskList.push((args, next) => {
		const { endpointsDotD } = args;

		const localCallback = (err, libraryPath) => {
			next(err, { ...args, libraryPath });
		};

		endpointsDotD.setLibraryPath(
			path.join(__dirname, '/qtDotLib.d'),
			localCallback
		);
	});

	// --------------------------------------------------------------------------------
	// TASKLIST ITEM TEMPLATE

	taskList.push((args, next) => {
		const { endpointsDotD } = args;

		const localCallback = (err, newValue) => {
			next(err, { ...args, newValue });
		};

		localCallback('', { ...args, something: 'good' });
	});

	// --------------------------------------------------------------------------------
	// TASKLIST ITEM TEMPLATE

	taskList.push((args, next) => {
		const { endpointsDotD } = args;

		const localCallback = (err, newValue) => {
			next(err, { ...args, newValue });
		};

		endpointsDotD.logList.push(moduleName);

		localCallback('', { ...args, something: 'good' });
	});

	// --------------------------------------------------------------------------------
	// TASKLIST ITEM TEMPLATE

	taskList.push((args, next) => {
		const { endpointsDotD } = args;

		const localCallback = (err, newValue) => {
			next(err, { ...args, newValue });
		};
		const passThroughParameters = { expressApp, accessTokenHeaderTools, accessPointsDotD, routingPrefix: '/api/' };
		endpointsDotD.loadModules({ passThroughParameters }, localCallback);
	});

	// --------------------------------------------------------------------------------
	// INIT AND EXECUTE THE PIPELINE

	const initialData =
		typeof inData != 'undefined' ? inData : { endpointsDotD, callback };
	pipeRunner(taskList.getList(), initialData, (err, args) => {
		const { endpointsDotD } = args;
		endpointsDotD.seal()
		callback(err, endpointsDotD);
	});
};
//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
