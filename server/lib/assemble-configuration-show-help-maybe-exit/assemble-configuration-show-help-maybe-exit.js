'use strict';

const qt = require('qtools-functional-library');

const asynchronousPipePlus = new require('qtools-asynchronous-pipe-plus')();
const pipeRunner = asynchronousPipePlus.pipeRunner;
const taskListPlus = asynchronousPipePlus.taskListPlus;

const commandLineParser = require('qtools-parse-command-line');

const findConfigFile = require('./find-config-file');

const figureOutConfigPathGen = require('./lib/figure-out-config-path'); //this file is almost always customized

const fs = require('fs');

//START OF moduleFunction() ============================================================

const moduleFunction = function (
	{ configName, applicationName, applicationControls, terminationFunction = process.exit },
	callback,
) {
	const { xLog } = process.global;
	const standardControls = [
		'-help',
		'--help',
		'-silent',
		'-quiet',
		'-verbose',
		'-debug',
		'-noColor',
		'-showConfig',
		'-outFile',
		'--overrideConfigPath',
		'-echoAlso',
	]; // add application specific flags at instantiation with applicationControls

	const validControls = standardControls.concat(applicationControls);

	const commandLineParameters = commandLineParser.getParameters();
	const figureOutConfigPath = figureOutConfigPathGen({});

	const taskList = [];

	//==============================================================================
	// get systemParameters.ini

	taskList.push((args, next) => {
		const localCallback =
			({ configPath }) =>
			(err, rawConfig) => {
				// ---------------------------------------------------------
				const getConfigActual =
					({ allConfigs, commandLIneParameters, config: unused }) =>
					(segmentName, { includeMeta = false } = {}) => {
						let result = {
							...allConfigs[segmentName],
							_segmentName: segmentName,
						};
						if (includeMeta) {
							result = {
								...result,
								_meta: rawConfig.allConfigs._meta,
							};
							return result;
						}

						return result;
					};
				// ---------------------------------------------------------

				const getConfig = getConfigActual({
					...rawConfig,
					commandLineParameters,
				});

				next(err, {
					...args,
					rawConfig,
					commandLineParameters,
					getConfig,
					configPath,
				});
			};

		const configFilePath = figureOutConfigPath.getConfigPath({
			commandLineConfigPath: commandLineParameters.qtGetSurePath(
				'values.overrideConfigPath[0]',
			),
			configName
		});

		if (!fs.existsSync(configFilePath)) {
			xLog.error(`Config file missing. ${configFilePath} does not exist.`);
			next('skipRestOfPipe');
			return;
		}
		xLog.status(`Using config file: ${configFilePath}`);

		findConfigFile.getConfig(
			{
				filePath: configFilePath,
				options:
					commandLineParameters.switches.prod ||
					commandLineParameters.switches.forceProd
						? { useProdPath: true }
						: void 0,
			},
			localCallback({ configPath: configFilePath }),
		);
	});

	//==============================================================================
	// show help and exit if requested (uses  defaultRequestFilePath from systemParameters)

	taskList.push((args, next) => {
		const { configPath, standardControls, applicationControls } = args;

		//commandLineParser does not include switch flags presented after an empty --values element.
		//eg, "deployPrograms filePath -xxx --values= --yyy" only finds xxx, not yyy
		//I use aliases to drive deployPrograms, eg, "alias copySomething=deployPrograms configPath --actions"
		//but also want to use "copySomething -help"
		//this expands to "deployPrograms configPath --actions -help" and the flaw omits switch.help.
		//This line works around the flaw. tqii 7/20/21

		const help = process.argv.filter((item) => item.match(/-help/)).qtLast();

		if (help) {
			const helpText = require('./lib/help-text');
			xLog.status(
				helpText.mainHelp({
					applicationName,
					configPath,
					standardControls,
					applicationControls,
				}),
			);

			terminationFunction(); //EXIT ==================================================
		}

		next('', args);
	});

	//==============================================================================
	// show config data if requested

	taskList.push((args, next) => {
		const { rawConfig, configFilePath } = args;

		const localCallback = (err, args) => {
			next(err, args);
		};

		if (commandLineParameters.switches.showConfig) {
			const cloneConfig = rawConfig.qtClone();
			const redactions = cloneConfig.REDACTIONS;

			redactions.forEach((dottedPath) =>
				cloneConfig.qtPutSurePath(dottedPath, '**********'),
			);

			xLog.result(
				JSON.stringify(
					cloneConfig.qtSelectProperties(
						['_meta', '_substitutions', 'REDACTIONS'],
						{
							excludeMode: true,
						},
					),
					'',
					'\t',
				),
			);
			terminationFunction(); //EXIT ==================================================
			//next('skipRestOfPipe');
			//return;
		}

		const errors = process.argv
			.filter((item) => item.match(/^-/))
			.filter((item) => {
				return !validControls.filter((validItem) => item.match(validItem))
					.length;
			});

		let errorMessage = '';

		if (errors.length) {
			const errList = errors
				.reduce((result, item) => result + item + ', ', '')
				.replace(/, $/, '');

			next(
				`Bad flags in command line ${errList}. Try --help. (Did you miss a double hyphen?)`,
			);
			return;
		}

		localCallback('', args);
	});

	//==============================================================================
	// init and execute pipeRunner

	const initialData = {
		standardControls,
		applicationControls,
		commandLineParameters,
		xLog,
	};
	asynchronousPipePlus.pipeRunner(
		taskList,
		initialData,
		(err, finalResult = {}) => {
			const { commandLineParameters = {}, rawConfig, getConfig } = finalResult;

			callback(err, {
				rawConfig,
				commandLineParameters,
				getConfig,
			});
		},
	);
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;

