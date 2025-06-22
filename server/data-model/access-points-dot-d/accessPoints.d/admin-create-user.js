#!/usr/bin/env node
'use strict';

/**
 * ACCESS POINT: ADMIN USER CREATION
 * 
 * This access point handles administrative user creation with secure password hashing
 * and validation. Only administrators can create new users.
 * 
 * BUSINESS LOGIC: Creates new users with validated data and proper security measures:
 * - Password strength validation using NIST guidelines
 * - Automatic password hashing before database storage
 * - Role validation and assignment
 * - Unique username enforcement
 * 
 * SECURITY FEATURES:
 * - All passwords are hashed using PBKDF2 with salt
 * - Input validation and sanitization
 * - Role-based access control
 * - No plaintext password storage
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
			if (!userData.username?.trim()) {
				errors.push('Username is required');
			}
			if (!userData.password) {
				errors.push('Password is required');
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

			// Password strength validation
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

			// Set default role if not specified
			const validatedUserData = {
				...userData,
				role: userData.role || 'user',
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
		// PIPELINE STAGE 3: CHECK FOR EXISTING USERNAME

		taskList.push((args, next) => {
			const { validatedUserData, userTable, dataMapping } = args;

			const localCallback = (err, existingUsers = []) => {
				if (err) {
					next(err, args);
					return;
				}

				if (existingUsers.length > 0) {
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
		// PIPELINE STAGE 4: CREATE NEW USER

		taskList.push((args, next) => {
			const { validatedUserData, userTable } = args;

			const localCallback = (err, refId) => {
				if (err) {
					next(`User creation failed: ${err}`, args);
					return;
				}
				next('', { ...args, refId });
			};

			// The mapper will automatically hash the password during 'reverse' transformation
			const dbData = dataMapping['profile-user'].map(validatedUserData, 'reverse');

			userTable.saveObject(
				dbData,
				{ suppressStatementLog: true },
				localCallback,
			);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 5: RETRIEVE CREATED USER (WITHOUT PASSWORD)

		taskList.push((args, next) => {
			const { refId, userTable } = args;

			const localCallback = (err, users = []) => {
				if (err) {
					next(err, args);
					return;
				}

				const user = users.qtLast();
				// Transform back to application format (automatically removes password)
				const userForClient = dataMapping['profile-user'].map(user, 'forward');
				
				next('', { ...args, createdUser: userForClient });
			};

			const query = `select * from <!tableName!> where refId='${refId}'`;
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

			const { createdUser } = args;
			callback('', { user: createdUser });
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