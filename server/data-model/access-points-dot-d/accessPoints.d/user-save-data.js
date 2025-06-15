#!/usr/bin/env node
'use strict';

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, ''); //this just seems to come in handy a lot
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

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

	const serviceFunction = (xQuery={}, callback) => {
		if (typeof args == 'function') {
			callback = args;
			args = {};
		}

		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// TASKLIST ITEM TEMPLATE

		taskList.push((args, next) =>
			args.sqlDb.getTable('users', mergeArgs(args, next, 'userTable')),
		);

		// --------------------------------------------------------------------------------
		// TASKLIST ITEM TEMPLATE

		taskList.push((args, next) => {
			const { xQuery, userTable } = args;

			const localCallback = (err, refId) => {
				next(err, { ...args, refId });
			};

			const dbData = dataMapping['profile-user'].map(xQuery, 'forward');
	
			userTable.saveObject(
				dbData,
				{ suppressStatementLog: true },
				localCallback,
			);
		});

		// --------------------------------------------------------------------------------
		// TASKLIST ITEM TEMPLATE

		taskList.push((args, next) => {
			const { refId, userTable } = args;

			const localCallback = (err, users=[]) => {
				const user=users.qtLast();
				next(err, { ...args, user });
			};


			const query = `select * from  <!tableName!> where refId='${refId}'`;

			userTable.getData(query, { suppressStatementLog: true }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// INIT AND EXECUTE THE PIPELINE

		const initialData = { xQuery, sqlDb, hxAccess, dataMapping, xQuery };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			const { user } = args;
			callback('', user);
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
