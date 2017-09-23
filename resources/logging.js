/**
 * @file Manages rudimentary file based logging.
 */
var winston = require('winston');
var app = require('electron').remote.app;
var path = require('path');
var fs = require('fs-plus');

module.exports = function(name, console) {
  var logPath = path.join(app.getPath('userData'), 'logs');

  // Make sure log dir exists.
  if (!fs.isDirectorySync(logPath)) {
    fs.mkdirSync(logPath);
  }

  // Setup winston logger.
  var Log = new winston.Logger({
    transports: [
      new (winston.transports.File)({
        maxsize: 1024 * 1024, // Max 1mb log file size.
        maxFiles: 3,
        filename: name + '.log',
        dirname: logPath
      })
    ]
  });

  // Override console functions with custom logging functions.
  const originalConsoleLog = console.log.bind(console);
  console.log = (...args) => {
    Log.info(args);
    originalConsoleLog(...args);
  };

  const originalConsoleInfo = console.info.bind(console);
  console.info = (...args) => {
    Log.info(args);
    originalConsoleInfo(...args);
  };

  const originalConsoleDebug = console.debug.bind(console);
  console.debug = (...args) => {
    Log.debug(args);
    originalConsoleDebug(...args);
  };

  const originalConsoleError = console.error.bind(console);
  console.error = (...args) => {
    Log.error(args);
    originalConsoleError(...args);
  };

  // Catch any remaining uncaught exceptions.
  process.on('uncaughtException', (e) => {
    Log.error(e);
    originalConsoleError(e);
  });
};
