#!/usr/bin/env node
'use strict';

// Suppress punycode deprecation warning
// process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, ''); //this just seems to come in handy a lot

// const qt = require('qtools-functional-library'); //also exposes qtLog(); qt.help({printOutput:true, queryString:'.*', sendJson:false});

const os = require('os');
const path = require('path');
const fs = require('fs');


//
// const commandLineParser = require('qtools-parse-command-line');
// const configFileProcessor = require('qtools-config-file-processor');
//
// const path=require('path');
// const fs=require('fs');
// const os=require('os');
//
// --------------------------------------------------------------------------------
// FIND PROJECT ROOT
// const findProjectRoot=({rootFolderName='system', closest=true}={})=>__dirname.replace(new RegExp(`^(.*${closest?'':'?'}\/${rootFolderName}).*$`), "$1");
// const projectRoot=findProjectRoot(); // call with {closest:false} if there are nested rootFolderName directories and you want the top level one
//--------------------------------------------------------------
// FIGURE OUT CONFIG
// const configName= os.hostname() == 'qMax.local' ? 'instanceSpecific/qbook' : '' ; //when deployed, usually the config is in the configs/ dir
// const configDirPath = `${projectRoot}/configs/${configName}/`;
// const config = configFileProcessor.getConfig('systemParameters.ini', configDirPath)
//
//
// const commandLineParameters = commandLineParser.getParameters();
//
//
// console.dir({['config']:config}, { showHidden: false, depth: 4, colors: true });
// console.dir({['commandLineParameters']:commandLineParameters}, { showHidden: false, depth: 4, colors: true });

//START OF moduleFunction() ============================================================
const moduleFunction =
	({ moduleName } = {}) =>
	({ unused }) => {
		const { xLog, getConfig, rawConfig, commandLineParameters } =
			process.global;
		const localConfig = getConfig(moduleName); //moduleName is closure

		// =====================================================================================

		const listFilesSync = (directory) => {
			const cliExecutablePaths = [];
			try {
				const files = fs.readdirSync(directory);
				files.forEach((file) => {
					const fullPath = path.join(libraryPath, file);
					const stats = fs.statSync(fullPath);
					let cliName;
					let executablePath;
					let looksGood = false;

					if (stats.isDirectory()) {
						const packageJsonPath = path.join(fullPath, 'package.json');

						if (fs.existsSync(packageJsonPath)) {
							try {
								const packageJson = JSON.parse(
									fs.readFileSync(packageJsonPath, 'utf8'),
								);
								const indexFile = packageJson.main || 'index.js';
								cliName = packageJson.main
									? packageJson.main.replace(/\.js$/, '')
									: path.basename(fullPath);
								executablePath = path.join(fullPath, indexFile);
								looksGood = true;
							} catch (error) {
								console.error(`something wrong with ${packageJsonPath}`);
							}
						}
					} else if (fullPath.match(/\.js$/)) {
						cliName = path.basename(fullPath).replace(/\.js$/, '');
						executablePath = fullPath;
						looksGood = true;
					}

					if (looksGood) {
						cliExecutablePaths.push({ cliName, executablePath });
					}
				});
			} catch (error) {
				console.error('Error reading directory:', error);
			}

			return cliExecutablePaths;
		};

		// --------------------------------------------

		const getPersistentSymlinkDir = () => {
			const homeDir = os.homedir();
			const platform = os.platform();

			if (platform === 'win32') {
				return path.join(
					process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
					'cli-symlinks',
				);
			} else if (platform === 'darwin') {
				return path.join(homeDir, 'bin');
			} else {
				return path.join(homeDir, '.local', 'bin');
			}
		};

		// --------------------------------------------

		function createSymlinks(cliData, projectName) {
			const symlinkDir = path.join(getPersistentSymlinkDir(), projectName);
			const uninstallMode = process.argv.includes('-removeSymlinks');
			const verbose = process.argv.includes('-verbose');

			// Delete the target symlink directory if it exists
			if (fs.existsSync(symlinkDir)) {
				try {
					// Remove all files in the directory first
					const files = fs.readdirSync(symlinkDir);
					for (const file of files) {
						const filePath = path.join(symlinkDir, file);
						if (fs.lstatSync(filePath).isSymbolicLink()) {
							fs.unlinkSync(filePath);
							verbose && console.log(`Removed existing symlink: ${filePath}`);
						} else {
							console.warn(`Skipping non-symlink file: ${filePath}`);
						}
					}
					
					// Remove the directory itself
					fs.rmdirSync(symlinkDir);
					verbose && console.log(`Removed existing symlink directory: ${symlinkDir}`);
				} catch (error) {
					console.error(`Error removing symlink directory ${symlinkDir}:`, error);
				}
			}
			
			if (uninstallMode) {
				console.log(`Symlinks in ${symlinkDir} have been removed.`);
				return;
			}
			
			// Create a fresh directory
			fs.mkdirSync(symlinkDir, { recursive: true });
			verbose && console.log(`Created new symlink directory: ${symlinkDir}`);

			cliData.forEach(({ cliName }) => {
				const symlinkPath = path.join(symlinkDir, cliName);

				// We don't need to check for existing symlinks as we've already cleared the directory
				if (!uninstallMode) {
					try {
						const { executablePath } = cliData.find(
							(entry) => entry.cliName === cliName,
						);
						fs.symlinkSync(executablePath, symlinkPath);
						verbose && console.log(`Symlink created: ${symlinkPath} -> ${executablePath}`);
					} catch (error) {
						console.error(`Error creating symlink for ${cliName}:`, error);
					}
				}
			});
			

			return symlinkDir;
		}

		// =====================================================================================

		const libraryPath = path.join(__dirname, 'lib.d');
		const cliExecutablePaths = listFilesSync(libraryPath);
		const symlinkDir = createSymlinks(cliExecutablePaths, 'PROJECT_NAME');

		console.log(symlinkDir); //give the new path addition to BASH
		console.log(`Use addCliModule to create a new CLI tool`);
	};

//END OF moduleFunction() ============================================================

const partOfSystem = false;
if (partOfSystem) {
	module.exports = moduleFunction({ moduleName }); //returns initialized moduleFunction
	//module.exports = moduleFunction({config, commandLineParameters, moduleName});
} else {
	// prettier-ignore
	{
	process.global = {};
	process.global.xLog = fs.existsSync('./lib/x-log')?require('./lib/x-log'):{ status: console.log, error: console.error, result: console.log };
	process.global.getConfig=typeof(getConfig)!='undefined' ? getConfig : (moduleName => ({[moduleName]:`no configuration data for ${moduleName}`}[moduleName]));
	process.global.commandLineParameters=typeof(commandLineParameters)!='undefined'?commandLineParameters:undefined;;
	process.global.rawConfig={}; //this should only be used for debugging, use getConfig(moduleName)
	}
	module.exports = moduleFunction({ moduleName })({}); //runs it right now
	//module.exports = moduleFunction({config, commandLineParameters, moduleName})();
}

