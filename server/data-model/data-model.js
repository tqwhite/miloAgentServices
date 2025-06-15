#!/usr/bin/env node
'use strict';

/**
 * DATA LAYER INITIALIZATION PIPELINE
 * 
 * This module orchestrates the data layer startup through a sequential pipeline:
 * 1. Database abstraction layer initialization (configurable: SQLite, etc.)
 * 2. Database instance creation and file system setup
 * 3. External sync data system initialization (configurable connectors)
 * 4. Data mapping layer loading (queries and transformations)
 * 5. Access points loading (dynamically loaded data access functions)
 * 
 * ARCHITECTURE DECISIONS:
 * - Configuration-driven database type selection for deployment flexibility
 * - Layered abstraction: generators → instances → access points → endpoints
 * - File system management with automatic directory creation
 * - Comprehensive logging for startup diagnostics and debugging
 * - Uses qtSelectProperties() for precise dependency injection between stages
 */

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, ''); //this just seems to come in handy a lot

const qt = require('qtools-functional-library'); //also exposes qtLog(); qt.help({printOutput:true, queryString:'.*', sendJson:false});

const os = require('os');
const path = require('path');
const fs = require('fs');

const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================
const moduleFunction =
	({ moduleName } = {}) =>
	({ unused }, callback) => {
		// ======================================================================================
		// CONFIGURATION AND UTILITIES SETUP
		// 
		// EXPLANATION: Loads data layer configuration and utilities. Configuration determines
		// which database type and sync system to use, allowing the same code to work with
		// different storage backends and external data sources.
		// 
		// TO ADD NEW DATABASE TYPES: Add implementation in ./lib/ and configure databaseTypeName
		// TO ADD NEW SYNC SYSTEMS: Add implementation in ./lib/ and configure syncDataSourceName

		const { xLog, getConfig, rawConfig, commandLineParameters } =
			process.global;
		const {
			databaseFileName,
			databaseContainerDirPath,
			databaseTypeName,
			syncDataSourceName,
		} = getConfig(moduleName); //moduleName is closure
		

		const { pwHash } = require('./lib/password-hash')();
		

		// ======================================================================================
		// DATA LAYER INITIALIZATION PIPELINE
		// 
		// EXPLANATION: Sequential pipeline builds data layer from bottom up. Each stage
		// depends on previous stages' outputs. Accumulates logging information for
		// startup diagnostics and passes components up the chain.
		// 
		// TO ADD NEW PIPELINE STAGES: Add new taskList.push() items before access points loading
		// TO DEBUG PIPELINE: Add xLog.debug(args, { label: 'Stage Name' }) at start of stages

		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 1: ABSTRACTION LAYER GENERATORS
		// 
		// EXPLANATION: Loads generator modules for database, sync data, and mapping layers.
		// These are factories that create actual instances based on configuration.
		// Database type and sync system are configurable for deployment flexibility.
		// 
		// OUTPUTS: sqlDbGen, syncDataGen, dataMapping
		// TO ADD NEW DATABASE TYPES: Create ./lib/{type}-instance.js and configure databaseTypeName
		// TO ADD NEW SYNC SYSTEMS: Create ./lib/{type}-instance.js and configure syncDataSourceName

		taskList.push((args, next) => {
			const { previousValue } = args;
			

			let sqlDbGen = require(`./lib/${databaseTypeName}`)({ getConfig }); //not visible to the rest of the system, hence, ./lib
			let syncDataGen = require(`./lib/${syncDataSourceName}`)({ getConfig }); //not visible to the rest of the system, hence, ./lib
			let dataMapping = require(`./data-mapping`)({});
			

			next('', { ...args, sqlDbGen, dataMapping, syncDataGen });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: DATABASE INSTANCE CREATION
		// 
		// EXPLANATION: Creates actual database instance with file system setup. Ensures
		// database directory exists and initializes database connection. The database
		// abstraction layer handles table creation, queries, and data operations.
		// 
		// INPUTS: sqlDbGen, databaseFileName, dataModelLogInfoList
		// OUTPUTS: sqlDb, dataModelLogInfoList (updated)
		// FILE SYSTEM: Creates databaseContainerDirPath if it doesn't exist

		taskList.push((args, next) => {
			const { sqlDbGen, databaseFileName, dataModelLogInfoList } = args;

			const localCallback = (databaseFilePath) => (err, sqlDb) => {
				dataModelLogInfoList.push(`Database File Path: ${databaseFilePath}`);
				next('', { ...args, sqlDb, dataModelLogInfoList });
			};

			const dbFileName = databaseFileName;
			const databaseFilePath = path.join(databaseContainerDirPath, dbFileName);
			fs.mkdirSync(databaseContainerDirPath, { recursive: true });

			sqlDbGen.initDatabaseInstance(
				databaseFilePath,
				localCallback(databaseFilePath),
			);
		});
		

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 3: SYNC DATA SYSTEM INITIALIZATION
		// 
		// EXPLANATION: Initializes external data synchronization system. This provides
		// access to remote data sources, APIs, or other external systems. The sync
		// system is configurable and can be swapped out for different deployments.
		// 
		// INPUTS: syncDataGen, dataModelLogInfoList
		// OUTPUTS: hxAccess, dataModelLogInfoList (updated with hxcLogInfoList)
		// TO CONFIGURE: Set syncDataSourceName in configuration to choose sync system type

		taskList.push((args, next) => {
			const { dataModelLogInfoList, syncDataGen } = args;
			

			const localCallback = (err, { hxcLogInfoList, hxAccess }) => {
				dataModelLogInfoList.push(...hxcLogInfoList);
				next(err, { ...args, dataModelLogInfoList, hxAccess });
			};

			syncDataGen.hxInit({}, localCallback);
		});
		

		// --------------------------------------------------------------------------------
		// [EXTERNAL DATA ACCESS PATTERN - COMMENTED OUT]
		// 
		// EXPLANATION: This commented section demonstrates the standard pattern for
		// accessing external data sources (APIs, web services, etc.) through the sync
		// system. This pattern has been used across many projects to integrate with
		// non-database data sources.
		// 
		// TO USE: Uncomment and modify endpointName for your external data source
		// PATTERN: hxAccess.hxGet({ endpointName: 'YourEndpoint' }, callback)
		// EXAMPLES: APIs, web services, file systems, message queues, etc.

// 		taskList.push((args, next) => {
// 			const { dataModelLogInfoList, hxAccess } = args;
// 			

// 			const localCallback = (err, result) => {
// 				console.log(
// 					`\n=-=============   result  ========================= [data-model.js.]\\n`,
// 				);

// 				console.dir(
// 					{ ['result']: result.length },
// 					{ showHidden: false, depth: 4, colors: true },
// 				);

// 				console.log(
// 					`\n=-=============   result  ========================= [data-model.js.]\\n`,
// 				);

// 				next(err, { ...args, result });
// 			};

// 			hxAccess.hxGet({ endpointName: 'WorkOrders' }, localCallback);
// 		});
		

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 4: ACCESS POINTS LOADING
		// 
		// EXPLANATION: Loads all access point modules from accessPoints.d/ directory.
		// Access points are data layer functions that encapsulate business logic and
		// provide a clean interface between endpoints and the database/sync systems.
		// Uses dynamic loading to automatically discover and register data access functions.
		// 
		// INPUTS: sqlDb, hxAccess, dataMapping
		// OUTPUTS: accessPointsDotD
		// TO ADD ACCESS POINTS: Create new .js files in ./access-points-dot-d/accessPoints.d/

		taskList.push((args, next) => {
			const localCallback = (err, accessPointsDotD) => {
				if (err) {
					next(err, args); //next('skipRestOfPipe', args);
					return;
				}

				next('', { ...args, accessPointsDotD });
			};

			require('./access-points-dot-d')(
				args.qtSelectProperties(['sqlDb', 'hxAccess', 'syncData', 'dataMapping']),
				localCallback,
			);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE EXECUTION
		// 
		// EXPLANATION: Executes the entire data layer initialization pipeline. Returns
		// the initialized access points and logging information to the calling module.
		// This provides the foundation that all other system components build upon.
		// 
		// RETURNS: accessPointsDotD (data access functions), dataModelLogInfoList (startup logs)

		const initialData = {
			databaseFileName,
			databaseContainerDirPath,
			databaseTypeName,
			dataModelLogInfoList: [],
		};
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			const { endpointsDotD, accessPointsDotD, dataModelLogInfoList } = args;
			callback(err, { accessPointsDotD, dataModelLogInfoList });
		});
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
