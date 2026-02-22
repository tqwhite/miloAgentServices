#!/usr/bin/env node
'use strict';

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, ''); // this just seems to come in handy a lot
// const projectRoot=fs.realpathSync(path.join(__dirname, '..', '..')); // adjust the number of '..' to fit reality

const qt = require('qtools-functional-library'); // qt.help({printOutput:true, queryString:'.*', sendJson:false});

const sqlite3 = require('sqlite3').verbose();

const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const sqlString = require('sqlstring-sqlite');

const newRefId = require('../new-refid')({
	excludedChars: ['0', 'O', '1', 'l'],
	digits: 20,
});

// START OF moduleFunction() ============================================================

const moduleFunction = function ({ unused }) {
	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(`${moduleName}`);

	// --------------------------------------------------------------------------------
	// INITIALIZE INDEXING AGENTS

	const jsonToTsv = (jsonData) => {
		const allKeys = Array.from(
			jsonData.reduce((keys, obj) => {
				Object.keys(obj).forEach((key) => keys.add(key));
				return keys;
			}, new Set()),
		); // Get the superset of all keys

		const headers = allKeys.join('\t'); // Get headers (property names) as a tab-separated string
		const rows = jsonData.map((obj) =>
			allKeys.map((key) => obj[key] ?? '').join('\t'),
		);
		const tsvData = `${headers}\n${rows.join('\n')}`; // Combine headers and rows into a single TSV string

		return tsvData;
	};

	// ================================================================================
	// DB ACCCESS FUNCTIONS

	// --------------------------------------------------------------------------------
	// EXEC STATTEMENT

	const runStatementActual =
		(db, tableName, defaultOptions) =>
		(statement, options = {}, callback) => {
			if (typeof options == 'function') {
				callback = options;
				options = defaultOptions;
			}
			Object.assign(defaultOptions, options);

			const { suppressStatementLog, noTableNameOk } = options;

			if (!noTableNameOk && !statement.match(/<!tableName!>/)) {
				xLog.error(
					`SQL statement has no <!tableName!> substitution tag. This is not allowed. [runStatementActual]`,
				);
				if (typeof callback == 'function') {
					callback(
						`SQL statement has no <!tableName!> substitution tag. This is not allowed. [runStatementActual]`,
						{},
					);
					return;
				} else {
					return '';
				}
			}
			const finalStatement = statement.qtTemplateReplace({ tableName });
			suppressStatementLog || xLog.status(finalStatement);

			if (typeof callback == 'function') {
				const localCallback = (err, directoryObjectsForDatabaseList) => {
					if (err) {
						xLog.error(
							`${''.padEnd(50, '-')}\nSQL Error; ${err.toString()}\nBad Statement:\n\t${finalStatement}\n${''.padEnd(50, '-')}\n`,
						);
					}
					callback(err, directoryObjectsForDatabaseList);
				};
				db.exec(finalStatement, localCallback);
			} else {
				return db.exec(finalStatement);
			}
		};

	// ================================================================================
	// WORKING FUNCTIONS

	// --------------------------------------------------------------------------------
	// GET DATA

	const getDataActual =
		(db, tableName, defaultOptions) =>
		(statement, options = {}, callback) => {
			if (typeof options == 'function') {
				callback = options;
				options = defaultOptions;
			}
			Object.assign(defaultOptions, options);

			const { suppressStatementLog, noTableNameOk } = options;
			if (!noTableNameOk && !statement.match(/<!tableName!>/)) {
				xLog.error(
					`SQL statement has no <!tableName!> substitution tag. This is not allowed. [getDataActual]`,
				);
				if (typeof callback == 'function') {
					callback(
						`SQL statement has no <!tableName!> substitution tag. This is not allowed. [getDataActual]`,
						{},
					);
					return;
				} else {
					return '';
				}
			}
			const finalStatement = statement.qtTemplateReplace({ tableName });
			suppressStatementLog || xLog.status(finalStatement);

			if (typeof callback == 'function') {
				db.all(finalStatement, (err, result) => {
					callback(err, result);
				});
			} else {
				return db.exec(finalStatement);
			}
		};

	// --------------------------------------------------------------------------------
	// SAVE OBJECT

	const getFieldNames = (createStatement, showCreateTableDebug) => {
		const tmp = createStatement.qtGetSurePath('[0].sql', '');

		if (showCreateTableDebug) {
			console.dir(
				{ ['createStatement']: createStatement },
				{ showHidden: false, depth: 4, colors: true },
			);
		}

		const fieldNamesx = createStatement
			.qtGetSurePath('[0].sql', '')
			.replace(/\t+/g, '')
			.replace(/(\[)/g, '')
			.replace(/\n+/g, '<!tmp!>')
			.replace(/ *(,|\)|\(|\<\!tmp\!\>) */g, '\n')
			.split(/\n+/)
			.map((item) => item.trim())
			.splice(1)
			.filter((item) => item)
			.map((line) => line.split(/]/)[0]);

		if (!createStatement) {
			return [];
		}

		const fieldNames = createStatement
			.qtGetSurePath('[0].sql', '')
			.replace(/\t+/g, '')
			.replace(/\n+/g, ' ')
			.split(/,/)
			.map((item) => item.match(/\[(?<fieldName>.*)\]/))
			.filter((item) => item)
			.map((item) => item.qtGetSurePath('groups.fieldName')); //groups come from the RegExp results

		return fieldNames;
	};

	// -------------------------

	// 'op_note', 'ds_uri', 'ds_requesttoken', 'ds_refid', 'ds_operation', 'ds_rsakeyserverstaticpublic', 'ds_authuserrequesttoken', 'ds_authusername', 'ds_username', 'ds_mac', 'ds_rsakeyclientstaticpublic', 'ds_requestingipaddress', 'isValid', 'reportingModuleName'

	const saveListActual =
		(saveObject) =>
		(inArray, options = {}, callback) => {
			const taskList = new taskListPlus();
			const resultList = [];

			// --------------------------------------------------------------------------------
			// TASKLIST ITEM TEMPLATE

			inArray.forEach((record) => {
				taskList.push((args, next) => {
					const localCallback = (err, result) => {
						resultList.push(result);
						next(err, args);
					};

					saveObject(record, options, localCallback);
				});
			});

			// --------------------------------------------------------------------------------
			// INIT AND EXECUTE THE PIPELINE

			const initialData = typeof inData != 'undefined' ? inData : {};
			pipeRunner(taskList.getList(), initialData, (err, args) => {
				callback(err, resultList);
			});
		};

	const saveObjectActual = ({
		runStatement,
		getData,
		tableName,
		defaultOptions,
		helpers,
	}) => {
		let counter = 0;
		
		return (inObj, options = {}, callback) => {
			const { saveList } = helpers;

			if (Array.isArray(inObj)) {
				saveList(inObj, options, callback);
				return;
			}

			if (typeof options == 'function') {
				callback = options;
				options = defaultOptions;
			}
			Object.assign(defaultOptions, options);
			const { showProgress, showCreateTableDebug } = defaultOptions;
			let logIncrement = showProgress;
			
			

			const taskList = new taskListPlus();

			const cleanObj = {};
			Object.keys(inObj).forEach((keyName) => {
				if (
					['boolean', 'number', 'string', 'bigint'].includes(
						typeof inObj[keyName],
					)
				) {
					cleanObj[keyName] =
						typeof inObj[keyName] == 'string'
							? inObj[keyName].trim().replace(/\'/g, "''")
							: inObj[keyName];
				}
			});

			taskList.push((args, next) => {
				const { runStatement, tableName, cleanObj } = args;
				const localCallback = (err, createStatement) => {
					const existingFieldNames = getFieldNames(
						createStatement,
						showCreateTableDebug,
					);
					const incomingFieldNames = Object.keys(cleanObj);

					// prettier-ignore
					if (showCreateTableDebug){
						console.log(`\n=-=============   existingFieldNames ${tableName} ========================= [sqlite-instance.js.moduleFunction]\n`);
						console.dir({['existingFieldNames']:existingFieldNames}, { showHidden: false, depth: 4, colors: true });
						console.log(`\n=-=============   incomingFieldNames  ${tableName} ========================= [sqlite-instance.js.moduleFunction]\n`);
						console.dir({['incomingFieldNames']:incomingFieldNames}, { showHidden: false, depth: 4, colors: true });
					}

					const addColumnStatements = incomingFieldNames
						.filter(
							(item) =>
								!existingFieldNames
									.map((item) => item.toLowerCase())
									.includes(item.toLowerCase()),
						)
						.map(
							(name) =>
								`ALTER TABLE <!tableName!> ADD COLUMN [${name}] TEXT;\n`,
						);

					next(err, { ...args, addColumnStatements });
				};

				getData(
					`SELECT sql FROM sqlite_master WHERE type='table' AND name='<!tableName!>';`,
					options,
					localCallback,
				);
			});

			taskList.push((args, next) => {
				const { runStatement, tableName, addColumnStatements } = args;
				const localCallback = (err) => {
					next(err, args);
				};

				if (!addColumnStatements || !addColumnStatements.length) {
					localCallback();
					return;
				}

				const statements = addColumnStatements.join('\n');
				xLog.status(
					`Adding ${addColumnStatements.length} new columns to ${tableName} in ${moduleName}`,
				);
				runStatement(statements, localCallback);
			});

			taskList.push((args, next) => {
				const { runStatement, tableName, cleanObj } = args;
				const localCallback = (err, existingRecords) => {
					next(err, { ...args, existingRecords });
				};

				getData(
					`SELECT * from '<!tableName!>' where [refId]='${cleanObj.refId}';`,
					options,
					localCallback,
				);
			});

			taskList.push((args, next) => {
				const {
					runStatement,
					tableName,
					addColumnStatements,
					cleanObj,
					sqlString,
					existingRecords,
				} = args;

				cleanObj.refId = cleanObj.refId ? cleanObj.refId : newRefId();

				const localCallback = (err) => {
					if (err) {
						errorList.push(err);
					}
					const refId = cleanObj.refId;
					next('', { ...args, refId });
				};

				if (existingRecords.length > 0) {
					const fieldNames = Object.keys(cleanObj)
						.reduce((result, item) => `${result}[${item}], `, '')
						.replace(/, $/, '');

					const assignmentPairs = Object.keys(cleanObj)
						.map((name) => `[${name}]=${sqlString.escape(cleanObj[name])}`)
						.join(', ');

					runStatement(
						`UPDATE <!tableName!> set ${assignmentPairs}  where [refId]='${cleanObj.refId}';`,
						options,
						localCallback,
					);
				} else {
					const fieldNames = Object.keys(cleanObj)
						.reduce((result, item) => `${result}[${item}], `, '')
						.replace(/, $/, '');

					const valueList = Object.keys(cleanObj)
						.map((name) => sqlString.escape(cleanObj[name]))
						.join(', ');

					runStatement(
						`INSERT INTO <!tableName!> (${fieldNames}) VALUES (${valueList});`,
						options,
						localCallback,
					);
				}

				counter++;

				if (showProgress && counter % logIncrement === 0) {
					xLog.status(`Wrote ${counter} records into ${tableName}`);
				}
			});
			const errorList = [];
			const initialData = {
				runStatement,
				tableName,
				cleanObj,
				jsonToTsv,
				sqlString,
				errorList,
			};
			pipeRunner(taskList.getList(), initialData, (err, args) => {
				const { refId } = args;
				if (err) {
					xLog.error(err);
				}

				callback(err, refId);
			});
		};
	};

	// ================================================================================
	// TABLE OBJECT

	const initTable = (runStatement, options, callback) => {
		if (typeof options == 'function') {
			callback = options;
			options = defaultOptions;
		}
		Object.assign(defaultOptions, options);

		// SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger';
		const statement = `
			CREATE TABLE IF NOT EXISTS <!tableName!> (
				[refId] TEXT PRIMARY KEY, 
				[createdAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
				[updatedAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);
			CREATE TRIGGER IF NOT EXISTS <!tableName!>UpdateTimestamp
				AFTER UPDATE ON <!tableName!>
				FOR EACH ROW
				BEGIN
				  UPDATE <!tableName!> SET [updatedAt] = CURRENT_TIMESTAMP;
				END;
			/* CREATE UNIQUE INDEX IF NOT EXISTS idx_<!tableName!>_refId ON <!tableName!>(refId)*/ /* instance */;`;
xLog.error(`HACKED: SQL statement in [${moduleName}]`);
		runStatement(statement, options, callback); //all databases have these, period. tqii
	};

	const getTableActual = (db, defaultOptions) => (owner, options, callback) => {
		if (typeof options == 'function') {
			callback = options;
			options = defaultOptions;
		}
		Object.assign(defaultOptions, options);

		const tableName = owner.replace(/\W/g, '_');

		// initialize methods
		const runStatement = runStatementActual(db, tableName, defaultOptions);
		const getData = getDataActual(db, tableName, defaultOptions);

		const helpers = {}; //saveObject() needs saveList() and vice versa
		const saveObject = saveObjectActual({
			runStatement,
			getData,
			tableName,
			defaultOptions,
			helpers,
		}); //saveObject() needs getData() because it checks the table schema and adjusts it before saving
		helpers.saveList = saveListActual(saveObject); //kack to get save by reference like behavior

		const localCallback = (err) => {
			const dbTable = { getData, saveObject, runStatement };
			callback(err, dbTable);
		};

		initTable(runStatement, options, localCallback); // NOTE: restart system if database is dropped.
	};

	// ================================================================================
	// CHECK TABLE EXISTS

	const checkTableExistsActual = (db) => (tableName, callback) => {
		// Use asynchronous query to check if table exists
		const query = "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?";
		
		if (callback) {
			// Asynchronous version
			db.get(query, [tableName], (err, result) => {
				if (err) {
					xLog.error(`Error checking table existence for ${tableName}: ${err.toString()}`);
					callback(err, false);
					return;
				}
				const exists = result && result.count > 0;
				callback(null, exists);
			});
		} else {
			// Synchronous version for compatibility
			try {
				const stmt = db.prepare(query);
				const result = stmt.get(tableName);
				stmt.finalize();
				return result && result.count > 0;
			} catch (err) {
				xLog.error(`Error checking table existence for ${tableName}: ${err.toString()}`);
				return false;
			}
		}
	};

	// ================================================================================
	// INITIALIZE INDEXING AGENTS

	const defaultOptions = {
		suppressStatementLog: true,
		showCreateTableDebug: false,
		noTableNameOk: false,
	};

	const initDatabaseInstance = (dbFilePath, callback) => {
		const db = new sqlite3.Database(dbFilePath);
		const getTable = getTableActual(db, defaultOptions);
		const checkTableExists = checkTableExistsActual(db);

		callback('', { getTable, checkTableExists, jsonToTsv, accessPoints: {} });
	};

	return { initDatabaseInstance };
};

// END OF moduleFunction() ============================================================

module.exports = moduleFunction;
// module.exports = new moduleFunction();
// moduleFunction().workingFunction().qtDump();

