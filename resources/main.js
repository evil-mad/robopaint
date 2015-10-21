/**
 * @file Holds all initially loaded and Node.js specific initialization code,
 * central cncserver object to control low-level non-restful APIs, and general
 * "top-level" UI initialization for settings.
 *
 */

// Must use require syntax for including these libs because of node duality.
window.$ = window.jQuery = require('jquery');
window._ = require('underscore');
$.qtip = require('qtip2');
window.i18n = require('i18next-client');

// Include global main node process connector objects.
var remote = require('remote');
var mainWindow = remote.getCurrentWindow();
var app = remote.require('app');
var appPath = app.getAppPath() + '/';
var rpRequire = require(appPath + 'resources/rp_modules/rp.require');

// Setup and hide extraneous menu items for Mac Menu
if (process.platform === "darwin") {
  // TODO: Implement Menus!
  // https://github.com/atom/electron/blob/master/docs/api/menu.md
}

// BugSnag NODE Initialization
//
// TODO: This needs lots more testing, near as I can tell, for node, this is
// just dandy, but here in node-webkit, it simply throws the app on its ass
// leaving the user wondering what the hell happened, and nothing to show for
// it. Yes, we do get a report in the management system, but it's not nice to
// people. Need to configure this to fail less deadly, or rely solely on the
// clientside plugin :/
/*var bugsnag = require("bugsnag");
bugsnag.register("e3704afa045597498ab11c74f032f755",{
  releaseStage: gui.App.manifest.stage,
  appVersion: gui.App.manifest.version
});*/


// Global Keypress catch for debug
$(document).keypress(function(e){
  if (e.keyCode == 4 && e.ctrlKey && e.shiftKey){
    mainWindow.openDevTools();
  }
});


var currentLang = "";
var fs = require('fs-plus');
var cncserver = require('cncserver');
var isModal = false;
var initializing = false;
var appMode = 'home';
var $subwindow = null; // Placeholder for mode subwindow webview

// Set the global scope object for any robopaint level details needed by other modes
var robopaint = {
  settings: {}, // Holds the "permanent" app settings data
  statedata: {}, // Holds per app session volitile settings
  cncserver: cncserver, // Holds the reference to the real CNC server object with API wrappers
  $: $, // Top level jQuery Object for non-shared object bindings
  appPath: appPath, // Absolute App path to prefix relative dir locations
  utils: rpRequire('utils'),
  get currentMode() {
    return appMode === "home" ? {robopaint: {}} : this.modes[appMode];
  }
};

// Add the Node CNCServer API wrapper
rpRequire('cnc_api')(cncserver, robopaint.utils.getAPIServer(robopaint.settings));

// currentBot lies outside of settings as it actually controls what settings will be loaded
robopaint.currentBot = robopaint.utils.getCurrentBot();

// Option buttons for connections
// TODO: Redo this is as a message management window system.
// Needs approximately same look, obvious, modal, sub-buttons. jQuery UI may
// not be quite enough. Requires some research (and good understanding of
// what this is currently used for, and what/if the other modes may make use of it).
var $options;
var $stat;

rpRequire('manager'); // Manage state and messages
rpRequire('cnc_utils'); // Canvas calculation utils
rpRequire('commander'); // Simple command queuing
rpRequire('wcb'); // WaterColorBot Specific group commands
rpRequire('mediasets') // Colors and other media specific details.

/**
 * Central home screen initialization (called after translations have loaded)
 */
function startInitialization() {
 initializing = true;

 try {
  // Initialize the mode webview.
  createSubwindow();

  // Bind and run inital resize first thing
  $(window).resize(responsiveResize);
  responsiveResize();

  // Load the modes (adds to settings content)
  loadAllModes();

  // Bind settings controls
  bindSettingsControls();

  // Load the colorset configuration data (needs to happen before settings are
  // loaded and a colorset is selected.
  getColorsets();

  // Load up initial settings!
  // @see scripts/main.settings.js
  loadSettings();

  // Initalize Tooltips (after modes have been loaded)
  initToolTips();

  // Load the quickload list
  initQuickload();

  // Prep the connection status overlay
  $stat = $('body.home h1');
  $options = $('.options', $stat);

  // Actually try to init the connection and handle the various callbacks
  startSerial();

  bindMainControls(); // Bind all the controls for the main interface
 } catch(e) {
   $('body.home h1').attr('class', 'error').text('Error During Initialization:')
     .append($('<span>').addClass('message').html("<pre>" + e.message + "\n\n" + e.stack + "</pre>"));
   console.error(e.stack);
 }
}

function createSubwindow(callback) {
  if ($subwindow !== null) return;

  $subwindow = $('<webview>').attr({
    border: 0,
    id: 'subwindow',
    class: 'hide',
    nodeintegration: 'true',
    disablewebsecurity: 'true',
    preload: './mode.preload.js'
  })
    .appendTo('body')
    .on('did-get-response-details', function(){
      // Open the mode's devtools when it's finished loading
      if (robopaint.currentMode.robopaint.debug === true) {
        $subwindow[0].openDevTools();
      }
    });

  // Prevent default drag drop on modes.
  $subwindow[0].addEventListener('dragover', function(e) {
    e.preventDefault();
  });

  // Log mode messages here if mode devtools isn't opened.
  $subwindow[0].addEventListener('console-message', function(e) {
    if (!$subwindow[0].isDevToolsOpened()){
      console.log('MODE:', e.message);
    }
  });

  // Hide the mode window then destroy it.
  $subwindow.hideMe = function(callback){
    $subwindow.fadeOut('slow', function(){
      destroySubwindow(callback);
    });
  };

  // Make the mode window visible (should only happen when it's ready);
  $subwindow.showMe = function(callback){
    $subwindow
      .css('opacity', 0)
      .removeClass('hide')
      .css('opacity', 100)
  };

  // Handle global channel message events from the mode (close/change/etc).
  $subwindow[0].addEventListener('ipc-message', function(event){
    switch (event.channel) {
      case 'globalclose': // Mode has decided it's OK to globally close.
        mainWindow.destroy();
        break;
      case 'modechange': // Mode has decided it's OK to change.
        continueModeChange();
        break;
      case 'modeReady':
        $subwindow.showMe();
        break;
      case 'modeLoadFail':
        robopaint.switchMode('home');

        // Alert the user the mode failed with a non-modal messagebox
        mainWindow.dialog({
          t: 'MessageBox',
          type: 'error',
          message: i18n.t('status.modeproblem.load'),
          cancelId: 1,
          detail: i18n.t('status.modeproblem.loaddetail'),
          buttons: [i18n.t('status.modeproblem.loadconsole'), i18n.t('status.modeproblem.loaddone')]
        }, function(showDevtools) {
          if (showDevtools === 0) {
            mainWindow.toggleDevTools();
          }
        });
        break;
    }
  });

  $(robopaint).trigger('subwindowReady');
  if (callback) callback();
}

function destroySubwindow(callback) {
  $subwindow.remove();
  $subwindow = null;
  createSubwindow(callback);
}

/**
 * Bind all DOM main window elements to their respective functionality
 */
function bindMainControls() {
  // Bind the continue/simulation mode button functionality
  $('button.continue', $options).click(function(e){
    $stat.fadeOut('slow');
    cncserver.continueSimulation();
    cncserver.serialReadyInit();

    if (initializing) {
      // Initialize settings...
      loadSettings();
      robopaint.utils.saveSettings(robopaint.settings);

      // Init sockets for data stream
      initSocketIO();

      $('body.home nav').fadeIn('slow');
      initializing = false;
    }

    setModal(false);
  });

  // Bind the reconnect button functionality
  $('button.reconnect').click(function(e){
    // Reconnect! Resets status and tries to start again
    $options.hide();
    startSerial();
  });


  window.onbeforeunload = onClose; // Catch close event

  // Bind links for home screen central bubble nav links
  $('nav a').click(function(e) {
     $('#bar-' + e.target.id).click();
    e.preventDefault();
  });

  // Bind links for toolbar ===========================
  $('#bar a.mode').click(function(e) {
    e.preventDefault();

    var $target = $(e.target);

    // Don't do anything if already selected
    if ($target.is('.selected')) {
      return false;
    }

    targetMode = $target;
    checkModeClose(false, e.target.id.split('-')[1]);
  });


  // Bind calibrator parts =========================
  $('#bar-calibrate').click(function(){
    var $c = $('#calibrator');
    if (!$c.data('visible')) {
      $c.css('top', '45px').data('visible', true);
    } else {
      $c.css('top', '').data('visible', false);
    }
  });

  // Bind toolbar modal links =======================
  $('#bar a.modal').click(function(e){
    var modal = this.id.split('-')[1];
    switch(modal) {
      case 'settings':
        // @see scripts/main.settings.js
        setSettingsWindow(true);
        break;
    }

    e.preventDefault();
  });

  // Bind help click (it's special)
  $('#bar-help').click(function(e){
    require('shell').openExternal(this.href);
    e.preventDefault();
  });
}

/**
 * Actually does the switching between modes (no checking/confirmation steps)
 *
 * @param {String} mode
 *   The mode's machine name. NOTE: Does no sanity checks!
 */
robopaint.switchMode = function(mode, callback) {
  if (appMode == mode) { // Don't switch modes if already there
    return;
  }

  appMode = mode; // Set the new mode

  $target = $('a#bar-' + mode);

  // Select toolbar element (and deselect last)
  $('#bar a.selected').removeClass('selected');
  $target.addClass('selected');

  switch (mode) {
    case 'home':
      $('nav, #logo').fadeIn('slow');
      $('#loader').hide();
      $subwindow.hideMe(callback);
      break;
    default:
      $('nav, #logo').fadeOut('slow');
      $('#loader').fadeIn();
      $subwindow.hideMe(function(){
        // Include the absolute root path so the mode can load its own info
        $subwindow.attr('src', $target.attr('href') + '#' + encodeURIComponent(robopaint.currentMode.root + 'package.json'));
        if (callback) callback();
      });
  }
}

/**
 * Specialty JS window resize callback for responsive element adjustment
 */
function responsiveResize() {

};

/**
 * Initialize the Socket.IO websocket connection
 */
function initSocketIO(){
  // Add Socket.IO include now that we know where from and the server is running
  var path = robopaint.cncserver.api.server.protocol +
    '://' + robopaint.cncserver.api.server.domain + ':' +
    robopaint.cncserver.api.server.port;
  robopaint.socket = io(path);
  $(robopaint).trigger('socketIOComplete');
}

/**
 * Binds all the callbacks functions for controlling CNC Server via its Node API
 */
function startSerial(){
  setMessage('status.start', 'loading');

  try {
    cncserver.start({
      botType: robopaint.currentBot.type,
      success: function() {
        setMessage('status.found');
      },
      error: function(err) {
        setMessage('status.error', 'warning', ' - ' + err);
        $options.slideDown('slow');
      },
      connect: function() {
        setMessage('status.success', 'success');
        $stat.fadeOut('slow');
        setModal(false);

        // If caught on startup...
        if (initializing) {
          $('body.home nav').fadeIn('slow');
          initializing = false;
        }

        // Initialize settings...
        loadSettings();
        robopaint.utils.saveSettings(robopaint.settings);

        // Init sockets for data stream
        initSocketIO();
      },
      disconnect: function() {
        setModal(true);
        $stat.show();
        setMessage('status.disconnect', 'error');
        $options.slideDown();
      }
    });
  } catch(e) {
   $('body.home h1').attr('class', 'error').text('Error During Serial Start:')
     .append($('<span>').addClass('message').html("<pre>" + e.message + "\n\n" + e.stack + "</pre>"));
   console.log(e.stack);
 }
}

/**
 * Runs on application close request to catch exits and alert user with dialog
 * if applicable depending on mode status
 */
function onClose(e) {
  if (!document.hasFocus()) return true;
  checkModeClose(true);
  e.preventDefault();
  return false;
}


/**
 * Runs current subwindow/mode specific close delay functions (if they exist).
 *
 * @param {Boolean} isGlobal
 *   Demarks an application level quit, function is also called for mode changes
 * @param {String} destination
 *   Name of mode change target. Used to denote special reactions.
 */
function checkModeClose(isGlobal, destination) {
  // Settings mode not considered mode closer
  if (destination == 'settings') {
    return;
  }

  if ($subwindow[0] && appMode !== 'home') {
    $subwindow[0].send(isGlobal ? 'globalclose' : 'modechange');
  } else {
    continueModeChange();
  }
}

var targetMode; // Hold onto the target ode to change to

function continueModeChange() {
  var mode = targetMode[0].id.split('-')[1];
  robopaint.switchMode(mode); // Actually switch to the mode
}

/**
 * Initialize the toolTip configuration and binding
 */
function initToolTips() {
  $("[title]:not([data-hasqtip])").each(function() {
    var $this = $(this);
    $this.qtip({
      style: {
        classes: 'qtip-bootstrap',
      },
      position: {
        my: 'top center',  // Position my top left...
        at: 'bottom center', // at the bottom right of...
        target: $this, // my target,
        viewport: $(window)
      },
      events: {
        render: function(event, api) {
          // Extract the title translation ID
          var transIDs = $this.data('i18n').split(';');
          var titleTransID = transIDs[0].split(']')[1];

          // Remove the translation data-i18ns for title (but not text node)
          if (transIDs.length === 1) {
            $this.removeAttr('data-i18n'); // Only had title, delete it
          } else if (transIDs.length === 2) {
            $this.attr('data-i18n', transIDs[1]); // Set to the main text ID
          }

          // Chuck the new title trans ID (without the [title]) onto the tooltip
          api.elements.content.attr('data-i18n', titleTransID);
        }
      }
    });
  });
}

/**
 * Initialize and bind Quickload file list functionality
 */
function initQuickload() {
  var $load = $('#bar-load');
  var $loadList = $('#loadlist');
  var paths = [appPath + 'resources/svgs'];

  // TODO: Support user directories off executable
  // This is imagined as secondary dropdown folder to list SVG files from a
  // "RoboPaint" directory in the user's operating system documents or pictures
  // folder, allowing for easy customizing of their quickload images. (This
  // could also be a good default location to save files to!). How do we get
  // that folder? No idea.
  var svgs = fs.readdirSync(paths[0]);

  // Bind Quick Load Hover
  $load.click(function(e) {
    if ($loadList.is(':visible')) {
      $loadList.fadeOut('slow');
    } else {
      $loadList.css('left', $load.offset().left + $load.width());
      $loadList.fadeIn('fast');
    }
    return false;
  });

  // Load in SVG files for quick loading
  if (svgs.length > 0) {
    $loadList.html('');
    for(var i in svgs) {
      var s = svgs[i];
      var name = s.split('.')[0].replace(/_/g, ' ');
      $('<li>').append(
        $('<a>').data('file', paths[0] + '/' + s).attr('href', '#').append(
          $('<img>').attr('src', paths[0] + '/' + s),
          $('<span>').text(name)
        )
      ).appendTo($loadList);
    }
  }

  // Bind loadlist item click load
  $('a', $loadList).click(function(e) {
    $loadList.fadeOut('slow');
    var fileContents = fs.readFileSync($(this).data('file'));

    // Push the files contents into the localstorage object
    window.localStorage.setItem('svgedit-default', fileContents);

     // Tell the current mode that it happened.
    cncserver.pushToMode('loadSVG');

    // Switch to print default if the current mode doesn't support SVGs
    if (robopaint.currentMode.robopaint.opensvg !== true) {
      $('#bar-print').click();
    }

    return false;
  });
}


/**
 * Fetches all colorsets available from the colorsets dir
 */
function getColorsets() {
  // Load the sets. Must happen here to get translations.
  robopaint.media.load();

  //  Clear the menu (prevents multiple copies appearing on language switch)
  $('#colorset').empty();

  // Actually add the colorsets in the correct weighted order to the dropdown
  _.each(robopaint.media.setOrder, function(setIndex){
    var c = robopaint.media.sets[setIndex];
    $('#colorset').append(
      $('<option>')
        .attr('value', setIndex)
        .text(c.type + ' - ' + c.name)
        .prop('selected', setIndex == robopaint.settings.colorset)
        .prop('disabled', !c.enabled) // Disable unavailable options
    );
  });

  // No options? Disable color/mediasets
  if (!$('#colorset option').length) {
    $('#colorsets').hide();
  }

  /*
  // TODO: This feature to be able to add custom colorsets has been sitting unfinished for
  // quite some time and seriously needs a bit of work. see evil-mad/robopaint#70

  // Menu separator
  $('#colorset').append($('<optgroup>').attr('label', ' ').addClass('sep'));

  // TODO: Append "in memory" custom sets here
  // These are new custom colorsets created by the new feature (not yet
  // completed), saved in new localStorage variable to avoid tainting settings.

  // Add "Create new" item
  $('#colorset').append(
    $('<option>')
      .attr('value', '_new')
      .text(robopaint.t('settings.output.colorsets.add'))
      .addClass('add')
  );
  */

  // Initial run to populate settings window
  updateColorSetSettings();
}

/**
 * Load all modes within the application
 */
function loadAllModes(){
  var modesDir = appPath + 'node_modules/';
  var files = fs.readdirSync(modesDir);
  var modes = {};
  var modeDirs = [];

  // Externalize mode details for later use.
  robopaint.modes = modes;

  // List all files, only add directories
  for(var i in files) {
    if (fs.statSync(modesDir + files[i]).isDirectory()) {
      modeDirs.push(files[i]);
    }
  }

  // Move through each mode package JSON file...
  for(var i in modeDirs) {
    var modeDir = modesDir + modeDirs[i] + '/';
    var package = {};

    try {
      package = require(modeDir + 'package.json');
    } catch(e) {
      // Silently fail on bad parse!
      continue;
    }

    // This a good file? if so, lets make it ala mode!
    if (package.type === "robopaint_mode" && _.has(package.robopaint, 'index')) {
      // TODO: Add FS checks to see if its index file actually exists
      package.root = modesDir + modeDirs[i] + '/';
      package.index = package.root + package.robopaint.index;
      modes[package.robopaint.name] = package;

      // Load any persistent scripts into the DOM
      if (package.robopaint.persistentScripts) {
        _.each(package.robopaint.persistentScripts, function(scriptPath){
          $('<script>').attr('src', package.root + scriptPath).appendTo('head');
        });
      }
    }
  }

  // Calculate correct order for modes based on package weight (reverse)
  var order = Object.keys(modes).sort(function(a, b) {
    return (modes[b].robopaint.weight - modes[a].robopaint.weight)
  });

  // Move through all approved modes based on mode weight and add DOM

  $('nav').append($('<table>').append($('<tr>')));
  for(var i in order) {
    var m = modes[order[i]];
    // Add the nav bubble
    var i18nStr = "modes." + m.robopaint.name + ".info.";
    $('nav table tr').prepend(
      $('<td>').append(
        $('<a>')
          .attr('href', m.index)
          .attr('id', m.robopaint.name)
          .attr('data-i18n', '[title]' + i18nStr + 'description;' + i18nStr + 'word')
          .attr('title', robopaint.t(i18nStr + 'description'))
          .css('display', (m.robopaint.core ? 'block' : 'none'))
          .text(robopaint.t(i18nStr + 'word'))
      )
    );

    // Add the toolbar link icon
    $('#bar-home').after(
      $('<a>')
        .attr('href', m.index)
        .attr('id', 'bar-' + m.robopaint.name)
        .addClass('mode tipped ' + (m.robopaint.core ? '' : ' hidden') )
        .css('background-image', "url('" +  m.root + m.robopaint.graphics.icon + "')")
        .attr('data-i18n', '[title]' + i18nStr + 'description')
        .attr('title', robopaint.t(i18nStr + 'description'))
        .html('&nbsp;')
    );

    // Add every mode to for enabling/disabling
    $('fieldset.advanced-modes aside:first').after($('<div>').append(
      $('<label>')
        .attr('for', m.robopaint.name + 'modeenable')
        .attr('data-i18n', i18nStr + 'title')
        .text(robopaint.t(i18nStr + 'title')),
      $('<input>')
        .attr({type: 'checkbox', id: m.robopaint.name + 'modeenable'})
        .prop('checked', m.robopaint.core),
      $('<aside>')
        .attr('data-i18n', i18nStr + 'detail')
        .text(robopaint.t(i18nStr + 'detail'))
    ));
  }
}


/**
 * Set modal message
 *
 * @param {String} transKey
 *   Translation key to be displayed
 * @param {String} mode
 *   Optional extra class to add to message element
 */
function setMessage(transKey, mode, append){
  if (transKey) {
    if (!append) append = '';
    $('b', $stat)
      .attr('data-i18n', transKey)
      .text(robopaint.t(transKey) + append);
  }

  if (mode) {
    $stat.attr('class', mode);
  }

}

/**
 * Set modal status
 *
 * @param {Boolean} toggle
 *   True for modal overlay on, false for off.
 */
function setModal(toggle){
  if (toggle) {
    $('#modalmask').fadeIn('slow');
  } else {
    $('#modalmask').fadeOut('slow');
  }

  isModal = toggle;
}

// Prevent drag/dropping onto the window (it's really bad!)
document.addEventListener('drop', function(e) {
  e.preventDefault();
  e.stopPropagation();
});
document.addEventListener('dragover', function(e) {
  e.preventDefault();
  e.stopPropagation();
});
