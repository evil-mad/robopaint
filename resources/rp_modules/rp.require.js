/**
 * @file RoboPaint Require module: provides a single function to help require
 * various named shortcut robopaint specific CommonJS modules listed below.
 */

var remote = require('remote');
var app = remote.require('app');
var appPath = app.getAppPath();
var _ = require('underscore');

// List of shortcuts and paths to RP modules and other libraries.
var modules = {
  paper: {path: appPath + '/node_modules/paper/dist/paper-full', type: 'dom'},
  d3plus: {path: appPath + '/node_modules/d3plus/d3plus.full.min.js', type: 'dom'},
  clipper: {path: appPath + '/resources/scripts/lib/clipper', type: 'node'},
  cnc_api: {path: appPath + '/node_modules/cncserver/example/cncserver.client.api', type: 'node'},
  home: {name: 'robopaint.home', type: 'node'},
  utils: {name: 'robopaint.utils', type: 'node'},
  mediasets: {name: 'robopaint.mediasets', type: 'node'},
  manager: {name: 'cncserver.manager', type: 'node'},
  wcb: {name: 'cncserver.wcb', type: 'node'},
  commander: {name: 'cncserver.commander', type: 'node'},
  cnc_utils: {name: 'cncserver.utils', type: 'node'},

  canvas: {name: 'paper.canvas', type: 'node'},
  paper_hershey: {name: 'paper.hersheytext', type: 'node'},
  paper_utils: {name: 'paper.utils', type: 'node'},
  auto_fill: {name: 'paper.auto.fill', type: 'node'},
  auto_stroke: {name: 'paper.auto.stroke', type: 'node'}
};

/**
 * RoboPaint require wrapper function.
 *
 * @param {string|object} module
 *   The short name of the API module, or an object representing standin
 *   shortcut object containing the type & name.
 * @param {function} callback
 *   Optional callback for when the script has loaded (for DOM insertion).
 */
 module.exports = rpRequire;
function rpRequire(module, callback){
  var m;
  if (_.isObject(module)) {
    m = module;
    module = m.name;
  } else {
    m = modules[module];
  }


  if (m) {
    var modPath = m.path;

    if (m.name) {
      modPath = appPath + '/resources/rp_modules/' + m.name;
    }

    if (modPath.split('.').pop().toLowerCase() !== 'js') modPath+= '.js';

    if (m.type === 'dom') {
      if (m.added === true) {
        console.error('rpRequire DOM module "' + module + '" already loaded!"');
        return false;
      }
      insertScript(modPath).onload = callback;
      m.added = true;
    } else if (m.type === 'node') {
      return require(modPath);
    }
  } else { // Shortcut not found
    console.error('rpRequire module "' + module + '" not found or supported!"');
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
