#!/usr/bin/env node
'use strict';

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, ''); //this just seems to come in handy a lot

const fs = require('fs');
const path = require('path');

const qt = require('qtools-functional-library'); //qt.help({printOutput:true, queryString:'.*', sendJson:false});

//START OF moduleFunction() ============================================================

const moduleFunction = ({ moduleName }) => ({pwHash}) => {
	const { xLog, getConfig, rawConfig:unused, commandLineParameters:notUsed } = process.global;
	const {placeholder} = getConfig(moduleName); //moduleName is closure


	const baseMappingProcess = mappingSpec => (inObj, {direction}) => {
		const outObj = {};
		if (direction == 'forward') {
			Object.keys(mappingSpec)
				.filter(name => {
					const tmp=inObj[mappingSpec[name]];
					return inObj[mappingSpec[name]];})
				.forEach(goodName => {
						outObj[goodName] = inObj[mappingSpec[goodName]];
				});
		} else {
			Object.keys(mappingSpec)
				.filter(name => inObj[name])
				.forEach(goodName => {
					outObj[mappingSpec[goodName]] = inObj[goodName];
				});
		}
		return outObj;
	};

	const moduleDirPath = path.join(__dirname, 'mappers');
	const resultObject = {};

	fs
		.readdirSync(moduleDirPath)
		.filter(file => path.extname(file) === '.js')
		.forEach(file => {
			const filePath = path.join(moduleDirPath, file);

			resultObject[
				path.basename(file).replace(path.extname(file), '')
			] = require(filePath)({ baseMappingProcess, pwHash });
		});

	const outObj = {
		...resultObject
	};

	return outObj;
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({moduleName}); //returns initialized moduleFunction

