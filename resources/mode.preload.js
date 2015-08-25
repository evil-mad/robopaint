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
var fs = require('fs-plus');
var appPath = app.getAppPath();
var i18n = window.i18n = require('i18next-client');
var $ = require('jquery');

// Get our mode path, find the mode's package.json, and load it.
var modePath = path.parse(window.location.pathname);
var mode = window.mode = require(path.join(modePath.dir, 'package.json'));
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

/**
 * Load language resources for this mode and RP common
 */
function i18nInit() {
  var res = {};
  var langCode;

  console.log('Loading languages...');

  // Iterate over language files for main RP i18n folder (gives mode access to
  // common strings).
  var fullPath = path.join(appPath, 'resources', '_i18n');
  fs.readdirSync(fullPath).forEach(function(file) {
    try {
      //  Add the data to the resource translation object
      var data = require(path.join(fullPath, file));
      langCode = data._meta.target;

      // Init empty resource language targets
      if (!res[langCode]) {
        res[langCode] = { translation: {} };
      }

      res[langCode].translation = data;
    } catch(e) {
      console.error('Bad language file:' + path.join(fullPath, file), e);
    }
  });

  // Iterate over language files in mode's i18n folder
  fullPath = path.join(mode.path.dir, '_i18n');
  fs.readdirSync(fullPath).forEach(function(file) {
    if (file.indexOf('.map.json') === -1) { // Don't use translation maps.
      try {
        //  Add the data to the resource translation object
        var data = require(path.join(fullPath, file));
        langCode = data._meta.target;

        // Init empty resource language targets
        if (!res[langCode].translation.modes) {
          res[langCode].translation.modes = {};
        }

        res[langCode].translation.modes[mode.name] = data;
      } catch(e) {
        console.error('Bad language file:' + path.join(fullPath, file), e);
      }
    }
  });

  i18n.init({
    resStore: res,
    ns: 'translation',
    fallbackLng: 'en-US',
    lng: localStorage['robopaint-lang']
  });

  // On jQuery load trigger, run the initial translation
  $(function(){ translateMode(); })
}

/**
 * Translate a mode, in either native or DOM map format. Will also trigger
 * translateComplete() function on window.mode object if it exists.
 */
function translateMode() {
  i18n.setLng(localStorage['robopaint-lang']);
  // DOM Map or native parsing?
  if (mode.i18n == 'dom') {
    var domFile = 'resources/modes/' + mode.name + '/_i18n/' + mode.name + '.map.json';
    try {
      var mappings = require(domFile).map;
      for (var selector in mappings) {
        var $elements = $(selector, $subwindow.contents());

        if ($elements.length === 0) {
          console.debug("TranslationDOM Map selector not found:", selector);
        }

        // When creating DOM map and i18n for non-native modes, it helps to know
        // which ones are done, and which aren't!
        var debugExtra = ""; //"XXX";

        // Replace text or specific attributes?
        var i18nKey = mappings[selector];
        if (typeof i18nKey === 'string') {
          // Can't use .text() as it will replace child nodes!
          $elements.each(function(){ // Just in case we select multiple elements.
            $(this)
              .contents()
              .filter(function(){ return this.nodeType == 3; })
              .first()
              .replaceWith(robopaint.t(i18nKey) + debugExtra);
          });
        } else if (typeof i18nKey === 'object') {
          for (var attr in i18nKey) {
            $elements.each(function(){ // Just in case we select multiple elements.
              if (attr === 'text') {
                $(this)
                  .contents()
                  .filter(function(){ return this.nodeType == 3; })
                  .first()
                  .replaceWith(robopaint.t(i18nKey.text) + debugExtra);
              } else {
                $(this).attr(attr, robopaint.t(i18nKey[attr]) + debugExtra);
              }
            });
          }
        }
     }

    } catch(e) {
      console.error('Bad DOM location file:' + domFile, e);
    }
  } else { // Native i18n parsing! (much simpler)
    // Quick fix for non-reactive re-translate for modes
    $('[data-i18n=""]').each(function() {
      var $node = $(this);
      if ($node.text().indexOf('.') > -1 && $node.attr('data-i18n') == "") {
        $node.attr('data-i18n', $node.text());
      }
    });
    i18n.translateObject(window.document.body);
  }

  // If this mode implements a translateComplete callback, call it.
  if (typeof mode.translateComplete === 'function') {
    mode.translateComplete();
  }
}

i18nInit();

console.log('RobPaint Mode APIs Preloaded & Ready!');
