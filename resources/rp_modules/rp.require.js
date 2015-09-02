/**
 * @file RoboPaint Require module: provides a single function to help require
 * various named shortcut robopaint specific CommonJS modules listed below.
 */

var remote = require('remote');
var app = remote.require('app');
var appPath = app.getAppPath();

// List of shortcuts and paths to RP modules and other libraries.
var modules = {
  paper: {path: appPath + '/node_modules/paper/dist/paper-full', type: 'dom'},
  utils: {name: 'robopaint.utils', type: 'node'},
  manager: {name: 'cncserver.manager', type: 'node'},
  wcb: {name: 'cncserver.wcb', type: 'node'},
  commander: {name: 'cncserver.commander', type: 'node'},
  cncutils: {name: 'cncserver.utils', type: 'node'}
};

/**
 * RoboPaint require wrapper function.
 *
 * @param {string} module
 *   The short name of the API module.
 * @param {function} callback
 *   Optional callback for when the script has loaded (for DOM insertion).
 */
 module.exports = rpRequire;
 function rpRequire(module, callback){
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
  var script = window.document.createElement('script');
  script.src = src;

  script.async = false;
  window.document.head.appendChild(script);
  return script;
}
