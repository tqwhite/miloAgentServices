#!/usr/bin/env node
'use strict';

/**
 * ACCESS POINT: ADMIN USER UPDATE
 * 
 * This access point handles administrative user updates with secure password hashing
 * and validation. Only administrators can update users.
 * 
 * BUSINESS LOGIC: Updates existing users with validated data:
 * - Optional password strength validation (only if password provided)
 * - Automatic password hashing before database storage (if password provided)
 * - Username uniqueness validation (excluding current user)
 * - Role validation and assignment
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
	const { validatePasswordStrength } = dataMapping['profile-user'];

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (userData, callback) => {
		if (typeof userData == 'function') {
			callback = userData;
			userData = {};
		}

		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 1: INPUT VALIDATION

		taskList.push((args, next) => {
			const { userData } = args;
			const errors = [];

			// Required fields validation
			if (!userData.refId?.trim()) {
				errors.push('User ID (refId) is required for updates');
			}
			if (!userData.username?.trim()) {
				errors.push('Username is required');
			}
			if (!userData.first?.trim()) {
				errors.push('First name is required');
			}
			if (!userData.last?.trim()) {
				errors.push('Last name is required');
			}
			if (!userData.emailAdr?.trim()) {
				errors.push('Email address is required');
			}

			// Email format validation
			if (userData.emailAdr && !userData.emailAdr.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
				errors.push('Invalid email address format');
			}

			// Username format validation (alphanumeric, underscore, hyphen only)
			if (userData.username && !userData.username.match(/^[a-zA-Z0-9_-]+$/)) {
				errors.push('Username can only contain letters, numbers, underscore, and hyphen');
			}

			// Password strength validation (only if password provided)
			if (userData.password) {
				const passwordValidation = validatePasswordStrength(userData.password);
				if (!passwordValidation.isValid) {
					errors.push(...passwordValidation.errors);
				}
			}

			// Role validation
			const validRoles = ['user', 'admin', 'super'];
			if (userData.role && !validRoles.includes(userData.role)) {
				errors.push('Invalid role specified');
			}

			if (errors.length > 0) {
				next(`Validation failed: ${errors.join(', ')}`, args);
				return;
			}

			// Sanitize and prepare data
			const validatedUserData = {
				...userData,
				username: userData.username.trim().toLowerCase(),
				first: userData.first.trim(),
				last: userData.last.trim(),
				emailAdr: userData.emailAdr.trim().toLowerCase(),
				phone: userData.phone?.trim() || ''
			};

			next('', { ...args, validatedUserData });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: DATABASE TABLE ACQUISITION

		taskList.push((args, next) =>
			args.sqlDb.getTable('users', mergeArgs(args, next, 'userTable')),
		);

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 3: CHECK FOR EXISTING USERNAME (excluding current user)

		taskList.push((args, next) => {
			const { validatedUserData, userTable, dataMapping } = args;

			const localCallback = (err, existingUsers = []) => {
				if (err) {
					next(err, args);
					return;
				}

				// Check if username exists for a different user (not the current one being updated)
				const duplicateUser = existingUsers.find(user => user.refId !== validatedUserData.refId);
				if (duplicateUser) {
					next('Username already exists', args);
					return;
				}

				next('', args);
			};

			const query = dataMapping['profile-user'].getSql('byUsername', { 
				username: validatedUserData.username 
			});

			userTable.getData(query, { suppressStatementLog: true, noTableNameOk: true }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 4: UPDATE USER

		taskList.push((args, next) => {
			const { validatedUserData, userTable } = args;

			const localCallback = (err, refId) => {
				if (err) {
					next(`User update failed: ${err}`, args);
					return;
				}
				next('', { ...args, refId });
			};

			// The mapper will automatically hash the password during 'reverse' transformation (if provided)
			const dbData = dataMapping['profile-user'].map(validatedUserData, 'reverse');

			userTable.saveObject(
				dbData,
				{ suppressStatementLog: true },
				localCallback,
			);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 5: RETRIEVE UPDATED USER (WITHOUT PASSWORD)

		taskList.push((args, next) => {
			const { validatedUserData, userTable } = args;

			const localCallback = (err, users = []) => {
				if (err) {
					next(err, args);
					return;
				}

				const user = users.qtLast();
				// Transform back to application format (automatically removes password)
				const userForClient = dataMapping['profile-user'].map(user, 'forward');
				
				next('', { ...args, updatedUser: userForClient });
			};

			const query = `select * from <!tableName!> where refId='${validatedUserData.refId}'`;
			userTable.getData(query, { suppressStatementLog: true }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// EXECUTE PIPELINE

		const initialData = { userData, sqlDb, hxAccess, dataMapping };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}

			const { updatedUser } = args;
			callback('', { user: updatedUser });
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