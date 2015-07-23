/**
 * @file Holds all initially loaded and Node.js specific initialization code,
 * central cncserver object to control low-level non-restful APIs, and general
 * "top-level" UI initialization for settings.
 *
 */

// Must use require syntax for including these libs because of node duality.
window.$ = window.jQuery = require('./scripts/lib/jquery.js');
window.$.i18n = window.i18n = require('./scripts/lib/i18next.js');

// Include global main node process connector objects.
var remote = require('remote');
var mainWindow = remote.getCurrentWindow();
var app = remote.require('app');

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
var appPath = app.getAppPath() + '/';
var barHeight = 40;
var isModal = false;
var initializing = false;
var appMode = 'home';
var $subwindow; // Placeholder for subwindow iframe
var subWin = {}; // Placeholder for subwindow "window" object

// Set the global scope object for any robopaint level details needed by other modes
var robopaint = {
  settings: {}, // Holds the "permanent" app settings data
  statedata: {}, // Holds per app session volitile settings
  // currentBot lies outside of settings as it actually controls what settings will be loaded
  currentBot: getCurrentBot(),
  cncserver: cncserver, // Holds the reference to the real CNC server object with API wrappers
  $: $, // Top level jQuery Object for non-shared object bindings
  appPath: appPath // Absolute App path to prefix relative dir locations
};

// Option buttons for connections
// TODO: Redo this is as a message management window system.
// Needs approximately same look, obvious, modal, sub-buttons. jQuery UI may
// not be quite enough. Requires some research (and good understanding of
// what this is currently used for, and what/if the other modes may make use of it).
var $options;
var $stat;

/**
 * Central home screen initialization (called after translations have loaded)
 */
function startInitialization() {
 initializing = true;

 try {
  // Add the secondary page iFrame to the page
  $subwindow = $('<iframe>').attr({
    height: $(window).height() - barHeight,
    border: 0,
    id: 'subwindow'
  })
    .css('top', $(window).height())
    .hide()
    .appendTo('body');

  // Bind and run inital resize first thing
  $(window).resize(responsiveResize);
  responsiveResize();

  // Load the modes (adds to settings content)
  loadAllModes();

  // Initalize Tooltips (after modes have been loaded)
  initToolTips();

  // Bind settings controls
  bindSettingsControls();

  // Must be run before we enumerate colorsets to ensure data is cached properly
  // Also must run after settings controls are bound (as that's when we get tool
  // data on current bot. TODO: Find a better home for that?
  verifyColorsetAbilities();

  // Load the colorset configuration data (needs to happen before settings are
  // loaded and a colorset is selected.
  getColorsets();

  // Load up initial settings!
  // @see scripts/main.settings.js
  loadSettings();

  // Set base CNC Server API wrapper access location
  if (!robopaint.cncserver.api) robopaint.cncserver.api = {};
  robopaint.cncserver.api.server = {
    domain: 'localhost',
    port: robopaint.settings.httpport,
    protocol: 'http',
    version: '1'
  }

  // Bind all the functionality required for Remote Print mode
  // @see scripts/main.api.js
  bindRemoteControls();

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
      saveSettings();

      // Init sockets for data stream
      initSocketIO();

      $('body.home nav').fadeIn('slow');
      initializing = false;
    }

    robopaint.api.bindCreateEndpoints();

    setModal(false);
  });

  // Bind the reconnect button functionality
  $('button.reconnect').click(function(e){
    // Reconnect! Resets status and tries to start again
    $options.hide();
    startSerial();
  });


  mainWindow.on('close', onClose); // Catch close event

  // Bind links for home screen central bubble nav links
  $('nav a').click(function(e) {
     $('#bar-' + e.target.id).click();
    e.preventDefault();
  });

  // Bind links for toolbar ===========================
  $('#bar a.mode').click(function(e) {
    e.preventDefault();

    checkModeClose(function(){
      var $target = $(e.target);
      var mode = $target[0].id.split('-')[1];

      // Don't do anything if already selected
      if ($target.is('.selected')) {
        return false;
      }

      robopaint.switchMode(mode); // Actually switch to the mode
    }, false, e.target.id.split('-')[1]);

    e.preventDefault();
  });

  // Bind toolbar modal links =======================
  $('#bar a.modal').click(function(e){
    var modal = this.id.split('-')[1];
    switch(modal) {
      case 'settings':
        // @see scripts/main.settings.js
        setSettingsWindow(true);
        break;
      case 'remoteprint':
        // @see scripts/main.api.js
        checkModeClose(function(){
          robopaint.switchMode('home');
          setRemotePrintWindow(true);
        }, false, "home");

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
      $subwindow.fadeOut('slow', function(){
        $subwindow.attr('src', "");
        if (callback) callback();
      });
      break;
    default:
      $('nav, #logo').fadeOut('slow');
      $('#loader').fadeIn();
      $subwindow.fadeOut('slow', function(){
        $subwindow.attr('src', $target.attr('href'));
        if (callback) callback();
      });
  }
}

/**
 * Specialty JS window resize callback for responsive element adjustment
 */
function responsiveResize() {
  // Position settings window dead center
  var $s = $('#settings');
  var size = [$s.width(), $s.height()];
  var win = [$(window).width(), $(window).height()];
  $s.css({left: (win[0]/2) - (size[0]/2), top: (win[1]/2) - (size[1]/2)});
  // Set height for inner settings content window, just remove tab and H2 height
  $s.find('.settings-content').height($s.height() - 80);

  // Set subwindow height
  if (typeof $subwindow !== 'undefined') {
    $subwindow.height($(window).height() - barHeight);
  }

  // Remote Print Window sizing
  if (robopaint.api.print.enabled) {
    var $rpWindow = $('#remoteprint-window');
    var scale = {};
    size = [$rpWindow.width(), $rpWindow.height()];
    var padding = {x: 20, y: 65};
    var fullSize = [$('#preview-scale-container').width(), $('#preview-scale-container').height()];

    scale.x = (size[0] - padding.x) / fullSize[0];
    scale.y = (size[1] - padding.y) / fullSize[1];

    scale = scale.x < scale.y ? scale.x : scale.y;

    $('#preview-scale-container').css({
      '-webkit-transform': 'scale(' + scale +')',
      left: size[0]/2 - ((fullSize[0]/2) * scale) + padding.x*2,
      top: size[1]/2 - ((fullSize[1]/2) * scale) + padding.y*2
    });
  }
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
        saveSettings();

        robopaint.api.bindCreateEndpoints();

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
  checkModeClose(function(){
    mainWindow.destroy(); // Until this is called
  }, true);
  e.preventDefault();
  return false;
}


/**
 * Runs current subwindow/mode specific close delay functions (if they exist)
 *
 * @param {Function} callback
 *   Function is called when check is complete, or is passed to subwindow close
 * @param {Boolean} isGlobal
 *   Demarks an application level quit, function is also called for mode changes
 * @param {String} destination
 *   Name of mode change target. Used to denote special reactions.
 */
function checkModeClose(callback, isGlobal, destination) {
  // Settings mode not considered mode closer
  if (destination == 'settings') {
    callback(); return;
  }

  if (appMode == 'print' || appMode == 'edit' || appMode == 'manual') {
    subWin.onClose(callback, isGlobal);
  } else {
    callback();
  }
}

/**
 * Initialize the toolTip configuration and binding
 */
function initToolTips() {
  $('#bar a.tipped, nav a').each(function() {
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

    if (appMode == 'print') {
      subWin.cncserver.canvas.loadSVG();
    } else if (appMode == 'edit') {
      subWin.methodDraw.openPrep(function(doLoad){
        if(doLoad) subWin.methodDraw.canvas.setSvgString(localStorage["svgedit-default"]);
      });

    } else {
      $('#bar-print').click();
    }

    return false;
  });
}


/**
 * "Public" helper function to fade in iframe when it's done loading
 */
function fadeInWindow() {
  if ($subwindow.offset().top != barHeight) {
    $subwindow.hide().css('top', barHeight).fadeIn('fast');
  }
  subWin = $subwindow[0].contentWindow;
  translateMode();
}


/**
 * Fetches all colorsets available from the colorsets dir
 */
function getColorsets() {
  var colorsetDir = appPath + 'resources/colorsets/';
  var files = fs.readdirSync(colorsetDir);
  var sets = [];

  // List all files, only add directories
  for(var i in files) {
    if (fs.statSync(colorsetDir + files[i]).isDirectory()) {
      sets.push(files[i]);
    }
  }

  robopaint.statedata.colorsets = {};

  // Move through each colorset JSON definition file...
  for(var i in sets) {
    var set = sets[i];
    var setDir = colorsetDir + set + '/';


    try {
      var fileSets = JSON.parse(fs.readFileSync(setDir + set + '.json'));
    } catch(e) {
      // Silently fail on bad parse!
      continue;
    }

     // Move through all colorsets in file
    for(var s in fileSets) {
      var c = fileSets[s];
      var machineName = c.machineName;

      try {
        // Add pure white to the end of the color set for auto-color
        c.colors.push({'white': '#FFFFFF'});

        // Process Colors to avoid re-processing later
        var colorsOut = [];
        for (var i in c.colors){
          var color = c.colors[i];
          var name = Object.keys(color)[0];
          var h = c.colors[i][name];
          var r = robopaint.utils.colorStringToArray(h);
          colorsOut.push({
            name: robopaint.t("colorsets.colors." + name),
            color: {
              HEX: h,
              RGB: r,
              HSL: robopaint.utils.rgbToHSL(r),
              YUV: robopaint.utils.rgbToYUV(r)
            }

          });
        }
      } catch(e) {
        console.error("Parse error on colorset: " + s, e);
        continue;
      }
      // Use the machine name and set name of the colorset to create translate
      // strings.
      var name  = "colorsets." + set + "." + machineName + ".name";
      var maker = "colorsets." + set + "." + machineName + ".manufacturer";
      var desc  = "colorsets." + set + "." + machineName + ".description";
      var media = "colorsets.media." + c.media;

      robopaint.statedata.colorsets[c.styles.baseClass] = {
        name: robopaint.t(name),
        type: robopaint.t(maker),
        weight: parseInt(c.weight),
        description: robopaint.t(desc),
        media: robopaint.t(media),
        enabled: robopaint.statedata.allowedMedia[c.media],
        baseClass: c.styles.baseClass,
        colors: colorsOut,
        stylesheet: $('<link>').attr({rel: 'stylesheet', href: setDir + c.styles.src}),
        styleSrc: setDir + c.styles.src
      };
    }
  }


  var order = Object.keys(robopaint.statedata.colorsets).sort(function(a, b) {
    return (robopaint.statedata.colorsets[a].weight - robopaint.statedata.colorsets[b].weight)
  });

  //  Clear the menu (prevents multiple copies appearing on language switch)
  $('#colorset').empty();

  // Actually add the colorsets in the correct weighted order to the dropdown
  for(var i in order) {
    var c = robopaint.statedata.colorsets[order[i]];
    $('#colorset').append(
      $('<option>')
        .attr('value', order[i])
        .text(c.type + ' - ' + c.name)
        .prop('selected', order[i] == robopaint.settings.colorset)
        .prop('disabled', !c.enabled) // Disable unavailable options
    );
  }

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
  var modesDir = appPath + 'resources/modes/';
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
      package = JSON.parse(fs.readFileSync(modeDir + 'package.json'));
    } catch(e) {
      // Silently fail on bad parse!
      continue;
    }

    // This a good file? if so, lets make it ala mode!
    if (package.type == "robopaint_mode" && package.main !== '') {
      // TODO: Add FS checks to see if its main file actually exists
      package.root = 'modes/' + modeDirs[i] + '/';
      package.main = package.root + package.main;
      modes[package.name] = package;
    }
  }

  // Calculate correct order for modes based on package weight (reverse)
  var order = Object.keys(modes).sort(function(a, b) {
    return (modes[b].weight - modes[a].weight)
  });

  // Move through all approved modes based on mode weight and add DOM

  $('nav').append($('<table>').append($('<tr>')));
  for(var i in order) {
    var m = modes[order[i]];
    // Add the nav bubble
    var i18nStr = "modes." + m.name + ".info.";
    $('nav table tr').prepend(
      $('<td>').append(
        $('<a>')
          .attr('href', m.main)
          .attr('id', m.name)
          .attr('data-i18n', '[title]' + i18nStr + 'description;' + i18nStr + 'word')
          .attr('title', robopaint.t(i18nStr + 'description'))
          .css('display', (m.core ? 'block' : 'none'))
          .text(robopaint.t(i18nStr + 'word'))
      )
    );

    // Add the toolbar link icon
    $('#bar-home').after(
      $('<a>')
        .attr('href', m.main)
        .attr('id', 'bar-' + m.name)
         // TODO: Add support for better icons
        .addClass('mode tipped ' + m.icon + (m.core ? '' : ' hidden') )
        .attr('data-i18n', '[title]' + i18nStr + 'description')
        .attr('title', robopaint.t(i18nStr + 'description'))
        .html('&nbsp;')
    );

    // Add the non-core settings checkbox for enabling
    if (!m.core) {
      $('fieldset.advanced-modes aside:first').after($('<div>').append(
        $('<label>')
          .attr('for', m.name + 'modeenable')
          .attr('data-i18n', i18nStr + 'title')
          .text(robopaint.t(i18nStr + 'title')),
        $('<input>').attr({type: 'checkbox', id: m.name + 'modeenable'}),
        $('<aside>')
          .attr('data-i18n', i18nStr + 'detail')
          .text(robopaint.t(i18nStr + 'detail'))
      ));
    }
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

/**
 * Simple wrapper to pull out current bot from storage
 *
 * @returns {Object}
 *   Current/default from storage
 */
function getCurrentBot() {
  var bot = {type: 'watercolorbot', name: 'WaterColorBot'};

  try {
    bot = JSON.parse(localStorage['currentBot']);
  } catch(e) {
    // Parse error.. will stick with default and write it.
    localStorage['currentBot'] = JSON.stringify(bot);
  }
  return bot;
}


