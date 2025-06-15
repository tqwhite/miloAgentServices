#!/usr/bin/env node
'use strict';

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, ''); // this just seems to come in handy a lot
// const projectRoot=fs.realpathSync(path.join(__dirname, '..', '..')); // adjust the number of '..' to fit reality

const qt = require('qtools-functional-library'); // qt.help({printOutput:true, queryString:'.*', sendJson:false});
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();
const axios = require('axios');
const https = require('https');
axios.defaults.maxContentLength = Infinity;

// START OF moduleFunction() ============================================================


/*


This module is SYMLINK'd into 
/Users/tqwhite/Documents/webdev/Enviromatic/applications/getEmailPictures/system/code/server/lib/notify-helix/lib


*/


const moduleFunction =
	({ moduleName } = {}) =>
	({ unused }) => {
		// --------------------------------------------------------------------------------
		// INITIALIZE INDEXING AGENTS

		const { xLog, getConfig, rawConfig, commandLineParameters } =
			process.global;
		const { hxcParms } = getConfig(`${moduleName}`);

		// --------------------------------------------------------------------------------
		// SERVICE FUNCTIONS

		const httpsAgent = new https.Agent({
			rejectUnauthorized: false,
		});

		const hxGetActual =
			({ hxcParms }) =>
			(requestArgs, callback) => {
				const { endpointName, queryParms } = requestArgs;

				const taskList = new taskListPlus();

				// --------------------------------------------------------------------------------
				// TASKLIST ITEM TEMPLATE

				taskList.push((args, next) => {
					const { hxcParms, endpointName } = args;

					const localCallback = (err, newValue) => {
						if (newValue == undefined) {
							err = 'No response from Helix';
						}

						next(err, { ...args, newValue });
					};
					const {logDriverScript} = queryParms;
					
					logDriverScript && xLog.status(`found logDriverScript `);

					const url = `${hxcParms.url}/${endpointName}`;
					xLog.status(`helix GET URL: ${url}`);
					const axiosParms = {
						method: 'get',
						url,
						params: queryParms,
						headers: {
							Accept: '*/*',
							'Accept-Language': 'en-US,en;q=0.5',
							Authorization: hxcParms.authString,
							'X-Requested-With': 'XMLHttpRequest',
							Connection: 'keep-alive',
							Referer: 'viro/webPix',
							Pragma: 'no-cache',
							'Cache-Control': 'no-cache',
						},
					};

					if (url.match(/^https/i)) {
						axiosParms.httpsAgent = httpsAgent;
					}

					axios(axiosParms)
						.then((response) => {
							const result = response.data;
							localCallback('', result);
						})
						.catch((err) => {
							localCallback(
								`${err.toString()} ${decodeURI(err.qtGetSurePath('response.data', 'no message'))}`,
							);
						});
				});

				// --------------------------------------------------------------------------------
				// INIT AND EXECUTE THE PIPELINE

				const initialData = { hxcParms, endpointName };
				pipeRunner(taskList.getList(), initialData, (err, args) => {
					const { newValue } = args;
					callback(err, newValue);
				});
			};

		const hxPostActual =
			({ hxcParms }) =>
			(requestArgs, callback) => {
				const { endpointName, postData, queryParms } = requestArgs;

				const taskList = new taskListPlus();

				// --------------------------------------------------------------------------------
				// TASKLIST ITEM TEMPLATE

				taskList.push((args, next) => {
					const { hxcParms, endpointName } = args;

					const localCallback = (err, newValue) => {
						if (newValue == undefined) {
							err = 'No response from Helix';
						}

						next(err, { ...args, newValue });
					};

					const logDriverScript = false;
					logDriverScript && xLog.status(`WARN: USING logDriverScript! `);

					const url = logDriverScript
						? `${hxcParms.url}/${endpointName}?logDriverScript=true`
						: `${hxcParms.url}/${endpointName}`;
					xLog.status(`helix POST URL: ${url}`);
					xLog.verbose(`writing helix data: ${JSON.stringify(postData)}`);
					const axiosParms = {
						method: 'post',
						url,
						params: queryParms,
						data: postData,
						headers: {
							Accept: '*/*',
							'Accept-Language': 'en-US,en;q=0.5',
							Authorization: hxcParms.authString,
							'X-Requested-With': 'XMLHttpRequest',
							Connection: 'keep-alive',
							Referer: 'viro/webPix',
							Pragma: 'no-cache',
							'Cache-Control': 'no-cache',
						},
					};

					if (url.match(/^https/i)) {
						axiosParms.httpsAgent = httpsAgent;
					}

					axios(axiosParms)
						.then((response) => {
							const result = response.data;
							localCallback('', result);
						})
						.catch((err) => {
							localCallback(
								`${err.toString()} ${decodeURI(err.qtGetSurePath('response.data', 'no message'))}`,
							);
						});
				});

				// --------------------------------------------------------------------------------
				// INIT AND EXECUTE THE PIPELINE

				const initialData = { hxcParms, endpointName };
				pipeRunner(taskList.getList(), initialData, (err, args) => {
					const { newValue } = args;
					callback(err, newValue);
				});
			};

		// --------------------------------------------------------------------------------
		// BUILD SERVICE FUNCTIONS

		const hxInitActual =
			({ hxcParms }) =>
			({ startupLogList }, callback) => {
				const taskList = new taskListPlus();

				// --------------------------------------------------------------------------------
				// TASKLIST ITEM TEMPLATE

				taskList.push((args, next) => {
					const { previousValue } = args;

					const hxcLogInfoList = startupLogList ? startupLogList : [];

					const hxPost = hxPostActual(initArgs); //I know hx is redundant but it makes it searchable

					const hxGet = hxGetActual(initArgs);

					next('', { hxGet, hxPost, hxcLogInfoList });
				});

				// --------------------------------------------------------------------------------
				// INIT AND EXECUTE THE PIPELINE

				const initialData = { hxcParms };
				pipeRunner(taskList.getList(), initialData, (err, args) => {
					const { startupLogList, hxcLogInfoList, hxGet, hxPost } = args;

					if (!startupLogList && hxcLogInfoList.length) {
						xLog.status(hxcLogInfoList);
					}

					const hxAccess = { hxGet, hxPost };
					callback(err, { hxcLogInfoList, hxAccess });
				});
			};

		// --------------------------------------------------------------------------------
		// INITIALIZE MODULE

		const initArgs = {
			hxcParms,
		};
		const hxInit = hxInitActual(initArgs); //I know hx is redundant but it makes it searchable

		return { hxInit };
	};

//END OF moduleFunction() ============================================================


module.exports = moduleFunction({ moduleName });
