#!/usr/bin/env node
'use strict';

/**
 * ACCESS POINT: ADMIN USER LIST
 * 
 * This access point handles administrative user listing for management interfaces.
 * Only administrators can list users.
 * 
 * BUSINESS LOGIC: Retrieves all users with sanitized data:
 * - Excludes passwords from returned data
 * - Formats data for frontend consumption
 * - Applies role-based filtering if needed
 */

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	// ================================================================================
	// INITIALIZATION AND DEPENDENCY INJECTION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(moduleName);

	const { sqlDb, hxAccess, dataMapping } = passThroughParameters;

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (requestData, callback) => {
		if (typeof requestData == 'function') {
			callback = requestData;
			requestData = {};
		}

		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 1: INPUT VALIDATION AND SETUP

		taskList.push((args, next) => {
			const { requestData } = args;

			// Optional filtering parameters
			const validatedRequestData = {
				role: requestData.role || null, // Optional role filter
				activeOnly: requestData.activeOnly !== false, // Default to active users only
				sortBy: requestData.sortBy || 'username', // Default sort
				sortOrder: requestData.sortOrder || 'asc' // Default order
			};

			next('', { ...args, validatedRequestData });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: DATABASE TABLE ACQUISITION

		taskList.push((args, next) =>
			args.sqlDb.getTable('users', mergeArgs(args, next, 'userTable')),
		);

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 3: RETRIEVE ALL USERS

		taskList.push((args, next) => {
			const { validatedRequestData, userTable, dataMapping } = args;

			const localCallback = (err, users = []) => {
				if (err) {
					next(err, args);
					return;
				}

				// Transform users to application format (removes passwords automatically)
				const usersForClient = users.map(user => 
					dataMapping['profile-user'].map(user, 'forward')
				);

				next('', { ...args, users: usersForClient });
			};

			// Get all users query
			const query = dataMapping['profile-user'].getSql('all', {});
			userTable.getData(query, { suppressStatementLog: true, noTableNameOk: true }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 4: APPLY FILTERING AND SORTING

		taskList.push((args, next) => {
			const { validatedRequestData, users } = args;
			let filteredUsers = [...users];

			// Apply role filter if specified
			if (validatedRequestData.role) {
				filteredUsers = filteredUsers.filter(user => user.role === validatedRequestData.role);
			}

			// Apply sorting
			const sortField = validatedRequestData.sortBy;
			const sortOrder = validatedRequestData.sortOrder;

			filteredUsers.sort((a, b) => {
				let aVal = a[sortField] || '';
				let bVal = b[sortField] || '';

				// Case-insensitive string comparison
				if (typeof aVal === 'string') aVal = aVal.toLowerCase();
				if (typeof bVal === 'string') bVal = bVal.toLowerCase();

				if (sortOrder === 'desc') {
					return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
				} else {
					return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
				}
			});

			next('', { ...args, filteredUsers });
		});

		// --------------------------------------------------------------------------------
		// EXECUTE PIPELINE

		const initialData = { requestData, sqlDb, hxAccess, dataMapping };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}

			const { filteredUsers } = args;
			callback('', { users: filteredUsers });
		});
	};

	// ================================================================================
	// ACCESS POINT REGISTRATION

	const addEndpoint = ({ name, serviceFunction, dotD }) => {
		dotD.logList.push(name);
		dotD.library.add(name, serviceFunction);
	};

	const name = moduleName;
	addEndpoint({ name, serviceFunction, dotD });

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;