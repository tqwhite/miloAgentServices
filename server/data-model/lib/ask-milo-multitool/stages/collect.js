'use strict';
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

//START OF moduleFunction() ============================================================
const moduleFunction = ({ moduleName } = {}) => ({ unused } = {}) => {
	const { xLog, getConfig, rawConfig, commandLineParameters, projectRoot } = process.global;
	const localConfig = getConfig(moduleName);

	const { formatText } = require('../formatters/text');
	const { formatJson } = require('../formatters/json');

	const collect = ({ mode, ...params }) => {
		const { config } = params;
		if (config.verbose) {
			const format = config.json ? 'JSON' : 'text';
			xLog.status(`[Collect] Formatting ${mode} output as ${format}`);
		}
		if (config.json) {
			const reportJson = formatJson({ mode, ...params });
			return { report: JSON.stringify(reportJson, null, 2), reportJson };
		} else {
			const report = formatText({ mode, ...params });
			return { report };
		}
	};

	return { collect };
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName })({});
