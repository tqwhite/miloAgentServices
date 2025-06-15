#!/usr/bin/env node
'use strict';

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, ''); //this just seems to come in handy a lot

const qt = require('qtools-functional-library'); //qt.help({printOutput:true, queryString:'.*', sendJson:false});

//START OF moduleFunction() ============================================================

const moduleFunction = ({ moduleName }) => () => {
	// SYSTEM INIT ---------------------------------
	const xLog = process.global.xLog;
	const crypto = require('crypto');

	const pwHash = (password, salt) => {

		salt = salt ? salt : crypto.randomBytes(16).toString('hex');

		// Hashing user's salt and password with 1000 iterations,

		const hash = crypto
			.pbkdf2Sync(password.toString(), salt, 1000, 64, `sha512`)
			.toString(`hex`);

		return { hash, salt };
	};
	
	//const verify=({password, hash, salt})=>true;

	return { pwHash };
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction(moduleName); //returns initialized moduleFunction
