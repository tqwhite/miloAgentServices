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
	
	// Verify password against stored hash and salt
	const verify = ({ password, hash, salt }) => {
		if (!password || !hash || !salt) {
			return false;
		}
		
		try {
			const hashToVerify = crypto
				.pbkdf2Sync(password.toString(), salt, 1000, 64, `sha512`)
				.toString(`hex`);
			
			return hashToVerify === hash;
		} catch (error) {
			xLog.error(`Password verification error: ${error.message}`);
			return false;
		}
	};

	// Hash password and return in storage format "hash:salt"
	const hashPassword = (password) => {
		if (!password) {
			throw new Error('Password is required for hashing');
		}
		
		const { hash, salt } = pwHash(password);
		return `${hash}:${salt}`;
	};

	// Verify password against storage format "hash:salt"
	const verifyPassword = (password, storedPassword) => {
		if (!password || !storedPassword) {
			return false;
		}
		
		// Check if it's in hash:salt format
		if (!storedPassword.includes(':')) {
			return false; // Not a hashed password
		}
		
		const [hash, salt] = storedPassword.split(':');
		return verify({ password, hash, salt });
	};

	// Check if password meets NIST 800-63B requirements
	const validatePasswordStrength = (password) => {
		const errors = [];
		
		// NIST 800-63B requirements:
		// - Minimum 8 characters (we'll use 12 for better security)
		// - Maximum 64 characters
		// - No composition rules (mixed case, numbers, special chars not required)
		// - Check against common passwords
		
		if (!password) {
			errors.push('Password is required');
			return { isValid: false, errors };
		}
		
		if (password.length < 12) {
			errors.push('Password must be at least 12 characters long');
		}
		
		if (password.length > 64) {
			errors.push('Password must be no more than 64 characters long');
		}
		
		// Check for common weak passwords
		const commonPasswords = [
			'password', '123456', '123456789', 'qwerty', 'abc123', 
			'password123', 'admin', 'letmein', 'welcome', 'monkey',
			'1234567890', 'password1', 'qwerty123', 'password12'
		];
		
		if (commonPasswords.some(common => password.toLowerCase().includes(common.toLowerCase()))) {
			errors.push('Password contains common words or patterns');
		}
		
		// Check for repeated characters (more than 3 in a row)
		if (/(.)\1{3,}/.test(password)) {
			errors.push('Password cannot contain more than 3 consecutive identical characters');
		}
		
		return {
			isValid: errors.length === 0,
			errors
		};
	};

	return { pwHash, verify, hashPassword, verifyPassword, validatePasswordStrength };
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction(moduleName); //returns initialized moduleFunction
