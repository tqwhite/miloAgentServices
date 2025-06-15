#!/usr/bin/env node
'use strict';

/**
 * ACCESS POINT EXAMPLE: USER LOGIN DATA ACCESS
 * 
 * This access point demonstrates the complete pattern for creating data access elements.
 * Use this file as a template when creating new access points.
 * 
 * BUSINESS LOGIC: Authenticates users by username/password with hybrid data sources:
 * - Primary: Database users table (persistent storage)
 * - Fallback: Built-in user list from configuration (admin/testing)
 * - Override: Root password accepts for any user (emergency access)
 * 
 * ARCHITECTURE PATTERN:
 * 1. Configuration setup and dependency injection
 * 2. Sequential pipeline using qtools-asynchronous-pipe-plus
 * 3. Database table acquisition with automatic table creation
 * 4. Data querying using mapper pattern (NOT raw SQL)
 * 5. Business logic processing with qtool functional chains
 * 6. Clean result formatting and error handling
 * 
 * TO CREATE A NEW ACCESS POINT:
 * 1. Copy this file to new name matching your business function
 * 2. Update moduleName and business logic in serviceFunction
 * 3. Modify configuration requirements in getConfig()
 * 4. Adjust pipeline stages for your data flow
 * 5. Update the registration name at bottom of file
 * 6. Create corresponding mapper in data-mapping/mappers/ if needed
 * 7. Test with corresponding endpoint
 */

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, ''); //this just seems to come in handy a lot
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const os = require('os');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	// ================================================================================
	// INITIALIZATION AND DEPENDENCY INJECTION
	// 
	// EXPLANATION: Access points receive shared resources through passThroughParameters,
	// a dependency injection mechanism that flows resources from the data-model layer
	// through the dynamic module loading system. This enables loose coupling - modules
	// receive dependencies rather than creating them.
	// 
	// ACCESS POINT LAYER DEPENDENCIES:
	// - sqlDb: Database abstraction layer (from data-model pipeline)
	// - hxAccess: External sync system access (configured connector)
	// - dataMapping: Collection of all mappers for query generation
	// 
	// TO ADD NEW CONFIG: Add to systemParameters.ini under [user-login] section

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const { rootPassword, builtinUserList, builtinsOnly, addBuiltinsToDatabase} = getConfig(moduleName); //moduleName is closure

	const { sqlDb, hxAccess, dataMapping } = passThroughParameters;

	// ================================================================================
	// SERVICE FUNCTION - THE MAIN BUSINESS LOGIC
	// 
	// EXPLANATION: This is the function that endpoints call to perform data operations.
	// It receives input data (xQuery) and returns results via callback.
	// 
	// PATTERN: All access points follow this signature: (inputData, callback)
	// INPUT: xQuery object containing request parameters (username, password, etc.)
	// OUTPUT: callback(err, resultData) with processed business data
	// 
	// TO MODIFY: Change the pipeline stages below to implement your business logic

	const serviceFunction = (xQuery, callback) => {
		if (typeof args == 'function') {
			callback = args;
			args = {};
		}

		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 1: DATABASE TABLE ACQUISITION
		// 
		// EXPLANATION: Gets reference to database table, creating it if it doesn't exist.
		// The table is created with standard columns (refId, createdAt, updatedAt) automatically.
		// 
		// PATTERN: Always use mergeArgs(args, next, 'propertyName') to add table to pipeline
		// TABLE NAMING: Use descriptive table names that match your business domain
		// 
		// TO MODIFY: Change 'users' to your table name, change 'userTable' to match

		taskList.push((args, next) =>
			args.sqlDb.getTable('users', mergeArgs(args, next, 'userTable')),
		);

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: OPTIONAL DATA SEEDING
		// 
		// EXPLANATION: Conditionally adds built-in users to database for testing/admin purposes.
		// This demonstrates how to handle data seeding and multiple data sources.
		// 
		// PATTERN: Use forwardArgs() when the operation doesn't return data to add to pipeline
		// BUSINESS RULE: Only seed if configured to do so and not in builtins-only mode
		// 
		// TO MODIFY: Replace with your own data seeding logic, or remove entirely

		if (!builtinsOnly && addBuiltinsToDatabase) {
			builtinUserList.forEach((userObj) => {
				taskList.push((args, next) => args.userTable.saveObject({...userObj, source:'addedBuiltin'}, forwardArgs({ next, args })));
			});
		}

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 3: DATABASE QUERY USING MAPPER PATTERN
		// 
		// EXPLANATION: Queries database using mapper instead of raw SQL. This is the
		// preferred pattern for all database access in this system.
		// 
		// MAPPER PATTERN:
		// 1. Use dataMapping['mapper-name'].getSql('queryName', {params})
		// 2. Pass query to tableRef.getData() with proper options
		// 3. Process results using qtools functional methods
		// 
		// OPTIONS EXPLAINED:
		// - suppressStatementLog: true - Don't log SQL statements (reduces noise)
		// - noTableNameOk: true - Allow <!tableName!> token replacement in queries
		// 
		// TO MODIFY: Change mapper name, query name, and parameters for your use case

		taskList.push((args, next) => {
			const { xQuery, userTable, builtinsOnly, dataMapping } = args;

			if (builtinsOnly) {
				next('', args);
				return;
			}

			const localCallback = (err, userList = []) => {
				const user = userList.qtLast();
				next(err, { ...args, user });
			};

			const query = dataMapping['profile-user'].getSql('byUsername', { 
				username: xQuery.username 
			});

			userTable.getData(query, { suppressStatementLog: true, noTableNameOk: true }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 4: FALLBACK DATA SOURCE USING QTOOLS FUNCTIONAL CHAINS
		// 
		// EXPLANATION: If database lookup failed, search configuration-based built-in users.
		// This demonstrates qtools functional programming patterns and fallback strategies.
		// 
		// QTOOLS PATTERN:
		// - qtGetByProperty(propertyName, searchValue, defaultIfNotFound) 
		// - qtLast() gets the last matching element
		// - Chaining allows safe navigation even if no matches found
		// 
		// BUSINESS LOGIC: Provides fallback authentication for admin/emergency access
		// 
		// TO MODIFY: Replace with your own fallback data sources or business rules

		taskList.push((args, next) => {
			const { xQuery, builtinUserList } = args;
			let { user } = args;
			
			if (!user) {
				user = builtinUserList
					.qtGetByProperty('username', xQuery.username, [])
					.qtLast();
			}

			next('', { ...args, user });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE EXECUTION AND BUSINESS LOGIC PROCESSING
		// 
		// EXPLANATION: Executes the entire pipeline and processes final business logic.
		// The final callback handles authentication validation and result formatting.
		// 
		// PIPELINE EXECUTION PATTERN:
		// 1. Create initialData with all needed parameters
		// 2. Use pipeRunner(taskList.getList(), initialData, finalCallback)
		// 3. Handle errors and format results in final callback
		// 
		// CRITICAL - PIPELINE ARGS MANAGEMENT:
		// The pipeline pattern relies on careful management of the args parameter throughout
		// all pipeline stages. Within pipeline stages, ALWAYS pass the complete args object
		// forward using: next('', { ...args, newProperty }). This accumulates state across
		// the entire pipeline and ensures all stages have access to previous results.
		// Pipeline stages can add multiple values: next('', { ...args, prop1, prop2, prop3 }).
		// 
		// IMPORTANT - RESULT FORMATTING:
		// Only at the FINAL callback should you return selected/calculated values from args,
		// NOT the entire args object. This prevents exposing internal pipeline data and keeps
		// interfaces clean. Use args.qtSelectProperties(['prop1', 'prop2']) for multiple values,
		// or destructure specific properties as shown below.
		// 
		// IMPORTANT - ALWAYS RETURN AN OBJECT:
		// Always return at least an empty object {} on success, never null/undefined. This
		// prevents every calling function from having to check if the result is an object
		// before testing its contents. Consistent object returns enable safe property access.
		// 
		// TO MODIFY: Change initialData properties and final processing logic

		const initialData = {
			xQuery,
			sqlDb,
			hxAccess,
			dataMapping,
			xQuery,
			rootPassword,
			builtinUserList,
			builtinsOnly,
		};
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			const { user = {}, rootPassword } = args;

			if (user.password == xQuery.password || rootPassword == xQuery.password) {
				//			delete user.password; //won't exist in the future when I implement pwHash
				callback('', {
					user,
				});
				return;
			}
			callback(err, {});
		});
	};

	// ================================================================================
	// ACCESS POINT REGISTRATION SYSTEM
	// 
	// EXPLANATION: This section registers the access point with the qtools-library-dot-d
	// dynamic loading system. The dotD object is provided by the library loader and
	// contains the core collection that manages all dynamically loaded modules.
	// 
	// dotD.library EXPLAINED:
	// - Core collection that stores all loaded access point functions
	// - Provides add(name, function) method to register new functions  
	// - Makes functions available by name: accessPointsDotD['user-login']()
	// - Manages the runtime library of all discovered .d/ directory modules
	// - Enables loose coupling through name-based function resolution
	// 
	// REGISTRATION PATTERN:
	// 1. Define addEndpoint helper function (standard across all access points)
	// 2. Set the name (usually moduleName for consistency)
	// 3. Call addEndpoint to register with dotD library
	// 4. Return empty object (required by module loading system)
	// 
	// ACCESS POINT NAMING:
	// - Use kebab-case matching filename (user-login.js → 'user-login')
	// - Names should be descriptive of business function
	// - Must be unique across all access points
	// 
	// TO MODIFY: Change the name to match your access point's purpose

	const addEndpoint = ({ name, method, serviceFunction, dotD }) => {
		dotD.logList.push(name);
		dotD.library.add(name, serviceFunction);
	};

	// ================================================================================
	// REGISTRATION EXECUTION
	// 
	// EXPLANATION: This actually registers the access point. The name determines
	// how endpoints will call this access point: accessPointsDotD['user-login']()
	// 
	// PATTERN: Use moduleName for consistency with filename

	const name = moduleName;

	addEndpoint({ name, serviceFunction, dotD });

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;