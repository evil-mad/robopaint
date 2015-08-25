/**
 * @file File preloaded in node-context for every RP Mode to give them mode API
 * components and variables. Replaces previous AMD style Require.js code.
 *
 * Globals made here are invisible to the window, but vars added to window will
 * become globals in the window.
 */
"use strict";

var remote = require('remote');
var path = require('path');
var app = remote.require('app');
var appPath = app.getAppPath();
var i18n = require('i18n-client');
window.i18n = i18n;
var $ = require('jquery');

// Get our mode path, find the mode's package.json, and load it.
var modePath = path.parse(window.location.pathname);
var mode = require(path.join(modePath.dir, 'package.json'));
mode.path = modePath;


// List of shortcuts and paths to RP modules and other libraries.
var modules = {
  paper: {path: appPath + '/node_modules/paper/dist/paper-full', type: 'dom'},
  utils: {name: 'robopaint.utils', type: 'node'},
  svgshared: {name: 'robopaint.mode.svg', type: 'dom'},
  wcb: {name: 'cncserver.client.wcb', type: 'dom'},
  commander: {name: 'cncserver.client.commander', type: 'dom'},
  paths: {name: 'cncserver.client.paths', type: 'dom'}
};

/**
 * RoboPaint require wrapper function.
 *
 * @param {string} module
 *   The short name of the API module.
 * @param {function} callback
 *   Optional callback for when the script has loaded (for DOM insertion).
 */
window.rpRequire = function(module, callback){
  var m = modules[module];

  if (m) {
    if (m.name) {
      m.path = appPath + '/resources/rp_modules/' + m.name;
    }

    m.path+= '.js';

    if (m.type === 'dom') {
      insertScript(m.path).onload = callback;
    } else if (m.type === 'node') {
      return require(m.path);
    }
  } else { // Shortcut not found
    return false;
  }

};

/**
 * Insert a script into the DOM of the mode page.
 *
 * @param {string} src
 *   The exact value of the src attribute to place in the script tag.
 */
function insertScript(src) {
  var script = document.createElement('script');
  script.src = src;
  script.async = false;
  document.head.appendChild(script);
  return script;
}

console.log('RobPaint Mode APIs Preloaded...');
