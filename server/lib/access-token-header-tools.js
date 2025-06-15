#!/usr/bin/env node
'use strict';

/**
 * Module Name: [moduleName]
 * Description: This module provides JWT authentication utilities for an Express application.
 */

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

// Required modules
const os = require('os');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

/**
 * Main module function
 */
const moduleFunction =
	({ moduleName } = {}) =>
	({ expressApp, userByUsername } = {}) => {
		// Retrieve global variables
		const { xLog, getConfig, rawConfig, commandLineParameters } =
			process.global;
		const { secret, authsecondsexpirationseconds } = getConfig(moduleName); // moduleName is closure

		// ============================================================
		// Function: hasValidToken
		// Description: Middleware to check if the request has a valid JWT token.
		// ============================================================
		const hasValidToken = (xReq, callback) => {
			xLog.status(`hasValidToken ${xReq.path}`);

			const taskList = new taskListPlus();

			// Extract and verify JWT token
			taskList.push((args, next) => {
				const authHeader = xReq.headers['authorization'];
				const token = authHeader && authHeader.split(' ')[1]; // Get the token from 'Bearer <token>'
				if (!authHeader) {
					// No token provided, set default authclaims
					xReq.appValueSetter('authclaims', {
						noToken: true,
						user: { role: 'public' },
					});
					next('skipRestOfPipe', args);
					return;
				}

				try {
					const authclaims = jwt.verify(token, secret);
					xReq.appValueSetter('authclaims', authclaims);
					next('', { ...args, authclaims });
				} catch (err) {
					xLog.status(`token error: ${err.toString()}`);
					next(`token error: ${err.toString()}`, args);
				}
			});

			// Retrieve user from database based on token claims
			taskList.push((args, next) => {
				const { userByUsername, authclaims } = args;
				if (authclaims.qtGetSurePath('user.role', []).includes('firstTime')) {
					next('', args);
					return;
				}
				const localCallback = (err, user) => {
					if (!user) {
						err = `token error: User not found`; // Token specifies user not in database
					}
					next(err, { ...args, user });
				};

				userByUsername(
					{
						username: authclaims.user?.username || 'unmatchablevalue',
					},
					localCallback,
				); // user-by-username.js
			});

			// Initialize and execute the task list
			const initialData = { userByUsername };
			pipeRunner(taskList.getList(), initialData, (err, args) => {
				if (err == 'skipRestOfPipe') {
					err = '';
				}
				callback(err);
			});
		};

		// ============================================================
		// Function: refreshauthtoken
		// Description: Middleware to refresh the JWT token.
		// ============================================================
		const refreshauthtoken = ({ xReq, xRes, payloadValues = {} }, callback) => {
			xLog.status(`refreshauthtoken ${xReq.path}`);
			const taskList = new taskListPlus();

			// Initialize and execute the task list
			const initialData = {};
			pipeRunner(taskList.getList(), initialData, (err, args) => {
				const authclaims = xReq.appValueGetter('authclaims');
				delete authclaims.exp;
				delete authclaims.iat;

				const payload = {
					...authclaims,
					...payloadValues,
					authsecondsexpirationseconds,
				};

				xReq.appValueSetter('authclaims', payload);

				const authtoken = jwt.sign(payload, secret, {
					expiresIn: authsecondsexpirationseconds,
				});

				xRes.set({
					authtoken,
					authclaims: JSON.stringify(payload),
					authsecondsexpirationseconds,
				});
				callback();
			});
		};

		// ============================================================
		// Function: getValidator
		// Description:
		//   Returns a validator function that checks if the user has the required permissions.
		// Parameters:
		//   - permissionList: Array of permitted roles.
		// ============================================================
		const getValidator = (permissionList) => {
			return (authclaims, options = {}, callback) => {
				if (typeof options == 'function') {
					callback = options;
					options = {};
				}

				const userRole = authclaims.user?.role;
				const tmp=permissionList.some((item) => userRole.includes(item));
				const isValid =
					permissionList.includes('public') ||
					permissionList.some((item) => userRole.includes(item)); //permissionList.includes(userRole);

				const err = isValid ? false : 'Unauthorized access';

				if (options.showDetails) {
					xLog.status(
						`\nauthclaims  ========================= [access-token-header-tools.js.]\n`,
					);
					xLog.status(`userRole=${userRole}`);
					xLog.status(authclaims);
					xLog.status(`\npermissionList  =========================\n`);
					xLog.status(permissionList);
					xLog.status(`\nerror message  =========================\n`);
					xLog.status(err);
					xLog.status(
						`\n  ========================= [access-token-header-tools.js.]\n`,
					);
				}

				if (typeof callback == 'function') {
					callback(err);
				} else {
					return err;
				}
			};
		};

		return { hasValidToken, refreshauthtoken, getValidator };
	};

module.exports = moduleFunction({ moduleName });
