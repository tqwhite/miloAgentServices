#!/usr/bin/env node
'use strict';
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, ''); //this just seems to come in handy a lot

const path = require('path');
const fs = require('fs');

const {pipeRunner, taskListPlus, mergeArgs, forwardArgs} = new require('qtools-asynchronous-pipe-plus')();


//START OF moduleFunction() ============================================================
const moduleFunction = ({ sqlDb, hxAccess, dataMapping }, callback) => {
	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(moduleName); //moduleName is closure


	// ================================================================================
	// MAIN PROCESS

	const accessPointsDotD = require('qtools-library-dot-d')({
		libraryName: 'Access Points'
	});
	
	const taskList = new taskListPlus();

	// --------------------------------------------------------------------------------
	// TASKLIST ITEM TEMPLATE

	taskList.push((args, next) => {
		const { accessPointsDotD } = args;

		const localCallback = (err, libraryPath) => {
			next(err, { ...args, libraryPath });
		};

		accessPointsDotD.setLibraryPath(
			path.join(__dirname, '/accessPoints.d'),
			localCallback
		);
	});

	// --------------------------------------------------------------------------------
	// TASKLIST ITEM TEMPLATE

	taskList.push((args, next) => {
		const { accessPointsDotD } = args;

		const localCallback = (err, newValue) => {
			next(err, { ...args, newValue });
		};

		accessPointsDotD.logList.push(moduleName);

		localCallback('', { ...args, something: 'good' });
	});

	// --------------------------------------------------------------------------------
	// TASKLIST ITEM TEMPLATE

	taskList.push((args, next) => {
		const { accessPointsDotD, sqlDb, hxAccess, dataMapping } = args;

		const localCallback = (err, newValue) => {
			next(err, { ...args, newValue });
		};
		
		const passThroughParameters = {sqlDb, hxAccess, dataMapping, accessPointsDotD};
		accessPointsDotD.loadModules({ passThroughParameters }, localCallback);
		
	});

	// --------------------------------------------------------------------------------
	// INIT AND EXECUTE THE PIPELINE

	const initialData =
		typeof inData != 'undefined' ? inData : { sqlDb, hxAccess, dataMapping, accessPointsDotD, callback };
	pipeRunner(taskList.getList(), initialData, (err, args) => {
		const { accessPointsDotD } = args;

		accessPointsDotD.seal(); //make the library immutable

		callback(err, accessPointsDotD);
	});
};
//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
