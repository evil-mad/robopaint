/**
 * @file Holds all initially loaded and Node.js specific initialization code,
 * central cncserver object to control low-level non-restful APIs, and general
 * "top-level" UI initialization for settings.
 */

// Must use require syntax for including these libs because of node duality.
window.$ = window.jQuery = require('jquery');
window._ = require('underscore');
$.qtip = require('qtip2');
window.i18n = require('i18next-client');

// Include global main node process connector objects.
var remote = require('electron').remote;
var mainWindow = remote.getCurrentWindow();
var app = remote.app;
var path = require('path');
var bytes = require('bytes');
var appPath = path.join(app.getAppPath(), '/');
var rpRequire = require(appPath + 'resources/rp_modules/rp.require');

// Define which modes are enabled by default, no longer provided by modes.
var coreModes = ['edit', 'print'];

// Global Keypress catch for debug
$(document).keypress(function(e){
  if (e.keyCode == 4 && e.ctrlKey && e.shiftKey){
    mainWindow.openDevTools();
  }
});

// Catch any errors in this intitial startup.
// TODO: This is a bit of a mess. We need to rely on FAR fewer globals, and
// initializing them so early means its harder to catch errors.
try {
  var currentLang = "";
  var fs = require('fs-plus');
  var cncserver = require('cncserver');
  var isModal = false;
  var initializing = false;
  var appMode = 'home';
  var homeVis = rpRequire('home');
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
} catch(e) {
  $(function(){
    $('body.home h1').attr('class', 'error').text('Error During Pre-Initialization:')
      .append($('<span>').addClass('message').html("<pre>" + e.message + "\n\n" + e.stack + "</pre>"));
    console.error(e.stack);
  });
}

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

  // Load the history list.
  initHistoryload();

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
    .appendTo('body');

  // Prevent default drag drop on modes.
  $subwindow[0].addEventListener('dragover', function(e) {
    e.preventDefault();
  });

  // Log mode messages here if mode devtools isn't opened.
  $subwindow[0].addEventListener('console-message', function(e) {
    if (!$subwindow[0].isDevToolsOpened()){
      console.log('MODE (' + appMode + '):', e.message);
    }
  });

  // Hide the mode window then destroy it.
  $subwindow.hideMe = function(callback){
    $subwindow.fadeOut('slow', function(){
      destroySubwindow(callback);
    });
  };

  // Hide the floating menus on focus.
  $subwindow.on('focus', function(){
    $('#history, #loadlist').fadeOut('fast');
  });

  // Make the mode window visible (should only happen when it's ready);
  $subwindow.showMe = function(callback){
    $('#loader').css('opacity', 0);
    $subwindow
      .css('top', 40)
      .css('opacity', 1);
  };


  // Open the devtools on dom-ready (the earliest they can be opened).
  $subwindow[0].addEventListener('dom-ready', function(){
    if (robopaint.currentMode.robopaint.debug === true && robopaint.settings.rpdebug) {
      $subwindow[0].openDevTools();
    }
  });

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
      case 'svgUpdate': // Mode has updated the shared SVG data.
        robopaint.reloadHistory();
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

      $('svg').fadeIn('slow');
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

  // Bind the external server connection button functionality
  $('button.external').click(function(e){
    if ($('div.external').is(':visible')){
      $('div.external').slideUp('slow');
    } else {
      $('div.external').slideDown('slow');
    }
  });

  robopaint.statedata.external = false;
  $('button#external-go').click(function(e){
    var $stat = $('#external-status');

    $stat.text(robopaint.t('external.status.connect'));

    // Setup the server location
    robopaint.cncserver.api.server.domain = $('#external-domain').val();
    robopaint.cncserver.api.server.port = $('#external-port').val();

    // Try to get the pen status...
    robopaint.cncserver.api.pen.stat(function(data) {
      if (data === false) {
        $stat.text(robopaint.t('external.status.error'));
        robopaint.cncserver.api.server.domain = 'localhost';
        robopaint.cncserver.api.server.port = '4242';
      } else {
        robopaint.statedata.external = true;
        $stat.text(robopaint.t('external.status.connected'));
        $options.slideUp('slow');
        $('button.continue').click();
      }
    });
  });

  window.onbeforeunload = onClose; // Catch close event

  // Bind links for toolbar ===========================
  $('#bar a.mode').click(function(e) {
    e.preventDefault();

    var $target = $(e.target);

    // Don't do anything if already selected and not developer mode.
    if ($target.is('.selected') && !robopaint.settings.rpdebug) {
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

  var stepIndex = 0;
  $('#calibrator button').click(function(){
    var goNext = $(this).is('.next');

    if (!goNext) stepIndex--;
    if (goNext) stepIndex++;

    switch(stepIndex) {
      case 0:
        break;
      case 1:
        cncserver.cmd.run([
          'park',
          ['move', {x:0, y:0}],
          'down',
          'unlock',
          'zero'
        ], true);
        break;
      case 2:
        cncserver.cmd.run('up');
        break;
      case 3:
        stepIndex = 0;
        $('#bar-calibrate').click();
        break;
    }

    $('#calibrator .wrapper').css('left', -(stepIndex * 400));
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
    require('electron').shell.openExternal(this.href);
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
  // Don't switch modes if already there, unless debug mode on.
  if (appMode == mode && !robopaint.settings.rpdebug) {
    return;
  }

  appMode = mode; // Set the new mode

  $target = $('a#bar-' + mode);

  // Select toolbar element (and deselect last)
  $('#bar a.selected').removeClass('selected');
  $target.addClass('selected');

  switch (mode) {
    case 'home':
      $('svg').fadeIn('slow');
      $('#loader').css('opacity', 0);
      $subwindow.hideMe(callback);
      break;
    default:
      $('svg').fadeOut('slow');
      $('#loader').css('opacity', 1);
      $subwindow.hideMe(function(){
        // Include the absolute root path so the mode can load its own info
        $subwindow
          .attr('src', $target.attr('href') + '#' + encodeURIComponent(robopaint.currentMode.root + 'package.json'))
          .css('opacity', 0)
          .removeClass('hide')
          .focus();
        if (callback) callback();
      });
  }
};

/**
 * Specialty JS window resize callback for responsive element adjustment
 */
function responsiveResize() {
  var leftMax = $('#bar-load').offset().left + 50;
  var rightMax = $('#bar-help').offset().left;
  var w = $(window).width();
  var $l = $('img.logo');
  var $v = $('span.version');

  // If the mode button pos is greater than half the width less 100px, adjust
  // the logo.
  if (leftMax > (w/2)-100) {
    if (rightMax < leftMax + 150) {
      // There's no room left for logo or version... goodbye!
      $l.add($v).css('opacity', 0);
    } else {
      // Squeeze logo and version together
      $l.css({
        left: leftMax + 100,
        width: 130,
        top: 0,
        opacity: 1
      });

      $v.css({
        left: (leftMax - 89) + 32,
        opacity: 1
      });
    }

  } else {
    $l.css({
      left: '',
      width: '',
      top: '',
      opacity: ''
    });

    $v.css({
      left: '',
      opacity: ''
    });
  }

}

/**
 * Initialize the Socket.IO websocket connection
 */
function initSocketIO(){
  if (robopaint.socket) robopaint.socket.destroy();

  // Add Socket.IO include now that we know where from and the server is running
  var server = robopaint.cncserver.api.server;
  var serverPath = server.protocol + '://' + server.domain + ':' + server.port;
  robopaint.socket = io.connect(serverPath);
  cncserver.socket = robopaint.socket;
  $(robopaint).trigger('socketIOComplete');
  return serverPath;
}

/**
 * Binds all the callbacks functions for controlling CNC Server via its Node API
 */
function startSerial(){
  setMessage('status.start', 'loading');

  try {
    // Load the CNCServer serial runner in a webview...
    var $runner = $('<webview>').attr({
      border: 0,
      class: 'hide',
      nodeintegration: 'true',
      src: '../node_modules/cncserver/runner/runner.html',
      disablewebsecurity: 'true',
    }).appendTo('body');

    // Report runner messages direct to the main console.
    $runner[0].addEventListener('console-message', function(e) {
      console.log('RUNNER:', e.message);
    });

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
          $('svg').fadeIn('slow');
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
  // Allow for quick refresh loads only with devtools opened.
  if (mainWindow.isDevToolsOpened()) {
    if (!document.hasFocus()) {
      app.relaunch();
      app.exit();
    }
  }

  checkModeClose(true);
  e.preventDefault();
  e.returnValue = false;
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
  } else if (destination){
    continueModeChange();
  } else if (!destination && appMode === 'home'){
    // Without a destination on home mode, we're just closing directly.
    mainWindow.destroy();
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
  var paths = [path.join(appPath, 'resources/svgs')];

  // TODO: Support user directories off executable
  // This is imagined as secondary dropdown folder to list SVG files from a
  // "RoboPaint" directory in the user's operating system documents or pictures
  // folder, allowing for easy customizing of their quickload images. (This
  // could also be a good default location to save files to!). How do we get
  // that folder? No idea.
  var svgs = fs.readdirSync(paths[0]);

  // Bind Quick Load Hover
  $load.click(function() {
    if ($loadList.is(':visible')) {
      $loadList.fadeOut('slow');
    } else {
      $loadList.css('left', $load.offset().left + $load.width());
      $loadList.fadeIn('fast');
      $('#history').fadeOut('fast');
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
        $('<a>').data('file', path.join(paths[0], s)).attr('href', '#').append(
          $('<img>').attr('src', path.join(paths[0], s)),
          $('<span>').text(name)
        )
      ).appendTo($loadList);
    }
  }

  // Bind loadlist item click load
  $('a', $loadList).click(function() {
    $loadList.fadeOut('slow');
    robopaint.setModeSVG($(this).data('file'));
    return false;
  });
}

/**
 * Simple wrapper for set the "current" SVG data for the current mode.
 *
 * @param  {string} svgFile
 *   The file path to the XML/SVG string data to set.
 * @return {undefined}
 */
robopaint.setModeSVG = function(svgFile) {
  fs.readFile(svgFile, function(err, fileContents){
    if (!err) {
      // Push the files contents into the localstorage object
      window.localStorage.setItem('svgedit-default', fileContents);

      // Resave the cache and update the history list.
      robopaint.utils.saveSVGCacheFile(fileContents);
      robopaint.reloadHistory();

      // Tell the current mode that it happened.
      cncserver.pushToMode('loadSVG');

      // Switch to print default if the current mode doesn't support SVGs
      if (robopaint.currentMode.robopaint.opensvg !== true) {
        $('#bar-print').click();
      }
    }
  });
};

/**
 * Initialize and bind the history Quickload file list functionality
 */
function initHistoryload() {
  var $button = $('#bar-history');
  var $historyList = $('#history');

  // Bind click activate.
  $button.click(function() {
    if ($historyList.is(':visible')) {
      $historyList.fadeOut('slow');
    } else {
      $historyList.css('left', $button.offset().left + $button.width());
      $historyList.fadeIn('fast');
      $('#loadlist').fadeOut('fast');
    }
    return false;
  });

  // Bind dynamic history item click load.
  $historyList.on('click', 'a', function() {
    $historyList.fadeOut('slow');
    robopaint.setModeSVG($(this).data('file'));
    return false;
  });

  var svgPath = robopaint.utils.getSVGCachePath();

  if (!fs.existsSync(svgPath)) {
    fs.mkdirSync(svgPath);
  }

  robopaint.reloadHistory();
}

// Reload the history content list (called elsewhere during updates);
robopaint.reloadHistory = function() {
  var $historyList = $('#history');
  var svgPath = robopaint.utils.getSVGCachePath();
  var svgs = fs.readdirSync(svgPath);
  svgs.sort(function(a, b) {
    return fs.statSync(path.join(svgPath, b)).mtime.getTime() -
          fs.statSync(path.join(svgPath, a)).mtime.getTime();
  });

  // Truncate the SVGs file list via the writable length property.
  if (svgs.length > 50) {
    svgs.length = 50;
  }

  // Load in SVG files for quick loading
  if (svgs.length > 0) {
    $historyList.html('');
    for(var i in svgs) {
      var svgFile = path.join(svgPath, svgs[i]);
      var stats = fs.statSync(svgFile);
      $('<li>').append(
        $('<span>').addClass('delete').click(function(){
          var $parent = $(this).parents('li');
          mainWindow.dialog({
            t: 'MessageBox',
            type: 'warning',
            message: i18n.t('nav.history.delete.message'),
            cancelId: 0,
            detail: i18n.t('nav.history.delete.detail'),
            buttons: [
              i18n.t('common.action.cancel'),
              i18n.t('nav.history.delete.confirm')
            ]
          }, function(deleteFile) {
            if (deleteFile === 1) {
              var svgFile = $parent.find('a').data('file');
              fs.unlink(svgFile, function(){
                $parent.slideUp('fast', function(){
                  $parent.remove();
                  robopaint.reloadHistory();
                });
              });
            }
          });
        }),
        $('<a>').data('file', svgFile).attr('href', '#').append(
          $('<img>').attr('src', svgFile),
          $('<span>').text(stats.mtime),
          $('<b>').text(bytes(stats.size))
        )
      ).appendTo($historyList);
    }
  } else {
    // No history items!
    $historyList.html(
      '<li><h4 data-i18n="nav.history.none">' +
      i18n.t('nav.history.none') + '</h4></li>'
    );
  }
};

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
  var modesDir = path.join(appPath, 'node_modules/');
  var files = fs.readdirSync(modesDir);
  var modes = {};
  var modeDirs = [];

  // List all files, only add directories
  for(var i in files) {
    if (fs.statSync(modesDir + files[i]).isDirectory()) {
      modeDirs.push(files[i]);
    }
  }

  // Move through each mode package JSON file...
  for(var i in modeDirs) {
    var modeDir = path.join(modesDir, modeDirs[i]);
    var package = {};

    if (fs.existsSync(path.join(modeDir, 'package.json'))) {
      try {
        package = require(path.join(modeDir, 'package.json'));
      } catch(e) {
        console.error('Problem reading mode package:', e)
        // Silently fail on bad parse!
        continue;
      }
    } else {
      continue;
    }

    // This a good file? if so, lets make it ala mode!
    if (package['robopaint-type'] === "mode" && _.has(package.robopaint, 'index')) {
      // TODO: Add FS checks to see if its index file actually exists
      package.root = path.join(modesDir, modeDirs[i], '/');
      package.index = path.join(package.root, package.robopaint.index);
      modes[package.robopaint.name] = package;

      // Load any persistent scripts into the DOM
      if (package.robopaint.persistentScripts) {
        _.each(package.robopaint.persistentScripts, function(scriptPath){
          $('<script>').attr('src', path.join(package.root, scriptPath)).appendTo('head');
        });
      }
    }
  }

  // Calculate correct order for modes based on package weight (reverse)
  var order = Object.keys(modes).sort(function(a, b) {
    return (modes[b].robopaint.weight - modes[a].robopaint.weight)
  });

  // Build external robopaint.modes in correct order
  robopaint.modes = _.chain(modes)
    .sortBy(function(mode){ return mode.robopaint.weight; })
    .indexBy(function(mode){ return mode.robopaint.name; })
    .value();


  // Grab enabled modes
  var set = robopaint.utils.getSettings();
  var enabledModes = {};

  if (set && set.enabledmodes) {
    enabledModes = set.enabledmodes;
  }

  // Move through all approved modes based on mode weight and add DOM
  for(var i in order) {
    var name = order[i];
    var m = modes[name];

    // This is the minimum enabled modes, other modes are enabled during
    // settings load/apply when it gets around to it.
    robopaint.modes[name].enabled = !_.isUndefined(enabledModes[name]) ? enabledModes[name] : (coreModes.indexOf(name) !== -1);

    // Add the toolbar link icon

    // This monstrosity is to ensure no matter where it lives, we can find the
    // correct relative path to put in the background image location. This is
    // especially picky on windows as the absolute backslashes are mangled on
    // URI encode and will be flipped at the end via the global replace.
    var iconURI = path.relative(
      path.join(appPath, 'resources'),
      path.join(m.root, m.robopaint.graphics.icon)
    ).replace(/\\/g, '/');

    var i18nStr = "modes." + m.robopaint.name + ".info.";
    $('#bar-home').after(
      $('<a>')
        .attr('href', m.index)
        .attr('id', 'bar-' + m.robopaint.name)
        .addClass('mode tipped ' + (robopaint.modes[name].enabled ? '' : ' hidden') )
        .css('background-image', "url('" +  iconURI + "')")
        .attr('data-i18n', '[title]' + i18nStr + 'use')
        .attr('title', robopaint.t(i18nStr + 'use'))
        .html('&nbsp;')
    );
  }

  // Add every mode to for enabling/disabling
  buildSettingsModeView();

  // Trigger modesLoaded for the home screen visualization.
  homeVis.modesLoaded();
}


function buildSettingsModeView() {
  _.each(robopaint.modes, function(mode){
    var m = mode.robopaint;
    var i18nStr = "modes." + m.name + ".info.";

    var $modeBox = $('<div>').attr('class', 'modebox' + (!mode.enabled ? ' disabled' : ''));

    // Add the Icon
    $modeBox.append(
      $('<img>')
        .addClass('icon')
        .attr('src', path.join(mode.root, m.graphics.icon))
    );

    var $details = $('<div>').addClass('details').appendTo($modeBox);

    $details.append(
      $('<label>')
        .attr('for', m.name + 'modeenable')
        .attr('data-i18n', i18nStr + 'name')
        .html(robopaint.t(i18nStr + 'name')),
      $('<h3>')
        .attr('data-i18n', i18nStr + 'use')
        .text(robopaint.t(i18nStr + 'use')),
      $('<div>')
        .attr('data-i18n', i18nStr + 'detail')
        .text(robopaint.t(i18nStr + 'detail'))
    );

    // Add in the preview image container
    var $previews = $('<div>').addClass('previews').appendTo($modeBox);

    // Add the enable switch
    $previews.append($('<div>').addClass('switch').append(
        $('<span>').addClass('ver').text('v' + mode.version),
        $('<input>')
          .attr({type: 'checkbox', id: m.name + 'modeenable'})
          .prop('checked', mode.enabled)
      )
    );

    // Add the preview images (if any).
    _.each(m.graphics.previews, function(imgPath){
       $previews.append(
         $('<img>')
          .attr('src', path.join(mode.root, imgPath))
          .toggleClass('multi', m.graphics.previews.length > 1)
          .click(function(){
            if (m.graphics.previews.length > 1) {
              $(this).fadeOut('slow', function(){
                $(this).prependTo($(this).parent()).show();
              });
            }
          })
       );
    })

    $('fieldset.advanced-modes').append($modeBox);
  });
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
