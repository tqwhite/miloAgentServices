#!/usr/bin/env node
'use strict';


//const qt = require('qtools-functional-library');

//START OF moduleFunction() ============================================================

const moduleFunction = function() {
const {xLog}=process.global;


const mainHelp=(args={})=>{


const {applicationName, configPath, version='n/a', errorMessage='', standardControls=[], applicationControls=[]}=args;

return `
============================================================

NAME

	${applicationName} - Do many good things
	
	Configuration File Path: ${configPath}

DESCRIPTION

	${applicationName} does all the good stuff.
	
	

CONTROLS

${applicationControls.join('\n')}

--overrideConfigPath	receive a path to a not-default configuration file (${xLog.color.red('DISABLE THIS?')})

OUTPUT

-help, --help	shows this help message. No processing is done.

-showConfig	display the final configuration file that would be used. No processing is done. (${xLog.color.red('DISABLE THIS?')})

-silent	suppress all messages
-quiet	only show errors
-verbose	everything useful for operation of the application
-debug	everything the author of the application ever thought would be useful for problem resolution

${standardControls.join(', ')}

EXAMPLES

${applicationName} -help



[version: ${version}]
============================================================
${errorMessage}
`
	;

}

	return ({mainHelp});
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction();
//moduleFunction().workingFunction().qtDump();

