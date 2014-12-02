/**
 * @file Holds all initially loaded and Node.js specific initialization code,
 * central cncserver object to control low-level non-restful APIs, and general
 * "top-level" UI initialization for settings.
 *
 */

global.$ = $;
var gui = require('nw.gui');


// Setup and hide extraneous menu items for Mac Menu
if (process.platform === "darwin") {
  var mb = new gui.Menu({type: 'menubar'});
  mb.createMacBuiltin('RoboPaint', {
    hideEdit: true,
    hideWindow: true
  });
  gui.Window.get().menu = mb;
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
    gui.Window.get().showDevTools();
  }
});


var currentLang = "";
var fs = require('fs');
var cncserver = require('cncserver');
var barHeight = 40;
var isModal = false;
var initializing = false;
var appMode = 'home';
var $subwindow = {}; // Placeholder for subwindow iframe
var subWin = {}; // Placeholder for subwindow "window" object

// Set the global scope object for any robopaint level details needed by other modes
var robopaint = {
  settings: {}, // Holds the "permanent" app settings data
  statedata: {}, // Holds per app session volitile settings
  // currentBot lies outside of settings as it actually controls what settings will be loaded
  currentBot: getCurrentBot(),
  cncserver: cncserver, // Holds the reference to the real CNC server object with API wrappers
  $: $, // Top level jQuery Object for non-shared object bindings
};

// Option buttons for connections
// TODO: Redo this is as a message management window system.
// Needs approximately same look, obvious, modal, sub-buttons. jQuery UI may
// not be quite enough. Requires some research (and good understanding of
// what this is currently used for, and what/if the other modes may make use of it).
var $options;
var $stat;

/**
 * Central home screen initialization (jQuery document ready callback)
 */
$(function() {
 initializing = true;

 try {
  // Bind and run inital resize first thing
  $(window).resize(responsiveResize);
  responsiveResize();



  // Load the modes (adds to settings content)
  loadAllModes();

  // Bind settings controls & Load up initial settings!
  // @see scripts/main.settings.js
  bindSettingsControls();
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

  // Add the secondary page iFrame to the page
  $subwindow = $('<iframe>').attr({
    height: $(window).height() - barHeight,
    border: 0,
    id: 'subwindow'
  })
    .css('top', $(window).height())
    .hide()
    .appendTo('body');

  // Prep the connection status overlay
  $stat = $('body.home h1');
  $options = $('.options', $stat);

  // Actually try to init the connection and handle the various callbacks
  startSerial();

  getColorsets(); // Load the colorset configuration data

  bindMainControls(); // Bind all the controls for the main interface
 } catch(e) {
   $('body.home h1').attr('class', 'error').text('Error During Initialization:')
     .append($('<span>').addClass('message').html("<pre>" + e.message + "\n\n" + e.stack + "</pre>"));
   console.error(e.stack);
 }
})

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


  gui.Window.get().on('close', onClose); // Catch close event

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
    gui.Shell.openExternal(this.href);
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
  if ($subwindow.height) {
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
  setMessage(robopaint.t('status.start'), 'loading');

  try {
    cncserver.start({
      botType: robopaint.currentBot.type,
      success: function() {
        setMessage(robopaint.t('status.found'));
      },
      error: function(err) {
        setMessage(robopaint.t('status.error') + ' - ' + err, 'warning');
        $options.slideDown('slow');
      },
      connect: function() {
        setMessage(robopaint.t('status.success'), 'success');
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
        setMessage(robopaint.t('status.disconnect'), 'error');
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
function onClose() {
  var w = this;

  checkModeClose(function(){
    w.close(true); // Until this is called
  }, true);
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
  // Check if this is not the first time initToolTips is running
  if ($('#bar a.tipped:first').data("tipped")) {
    // Destroy existing ToolTips before recreating them
    $('#bar a.tipped, nav a').qtip("destroy");
  };

  $('#bar a.tipped, nav a').qtip({
    style: {
      border: {
        width: 5,
        radius: 10
      },
      padding: 10,
      tip: true,
      textAlign: 'center',
      name: 'blue'
    },
    position: {
      corner: {
        target: 'bottomMiddle',
        tooltip: 'topMiddle'
      },
      adjust: {
        screen: true,
        y: 6,
        x: -5
      }
    },
    api: {
      beforeShow: beforeQtip
    }
  }).click(function(){
    $(this).qtip("hide");
  }).data("tipped", true);

  function beforeQtip(){
    // Move position to be more centered for outer elements
    if (this.id <= 1) {
      this.elements.wrapper.parent().css('margin-left', -30);
    }

    if (this.getPosition().left + this.getDimensions().width + 250 > $(window).width()) {
      this.elements.wrapper.parent().css('margin-left', 30);
    }
  }
}

/**
 * Initialize and bind Quickload file list functionality
 */
function initQuickload() {
  var $load = $('#bar-load');
  var $loadList = $('#loadlist');
  var paths = ['resources/svgs'];

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
        $('<a>').text(name).data('file', paths[0] + '/' + s).attr('href', '#')
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
}


/**
 * Fetches all colorsets available from the colorsets dir
 */
function getColorsets() {
  var colorsetDir = 'resources/colorsets/';
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
    );
  }

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

  // Initial run to populate settings window
  updateColorSetSettings();
}

/**
 * Load all modes within the application
 */
function loadAllModes(){
  var modesDir = 'resources/modes/';
  var files = fs.readdirSync(modesDir);
  var modes = [];
  var modeDirs = [];

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
      package.main = 'modes/' + modeDirs[i] + '/' + package.main;
      modes.push(package);
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
    $('nav table tr').prepend(
      $('<td>').append(
        $('<a>')
          .attr('href', m.main)
          .attr('id', m.name)
          .attr('title', m.description)
          .css('display', (m.core ? 'block' : 'none'))
          .text(m.word)
      )
    );

    // Add the toolbar link icon
    $('#bar-home').after(
      $('<a>')
        .attr('href', m.main)
        .attr('id', 'bar-' + m.name)
         // TODO: Add support for better icons
        .addClass('mode tipped ' + m.icon + (m.core ? '' : ' hidden') )
        .attr('title', m.description)
        .html('&nbsp;')
    );

    // Add the non-core settings checkbox for enabling
    if (!m.core) {
      $('fieldset.advanced-modes aside:first').after($('<div>').append(
        $('<label>').attr('for', m.name + 'modeenable').text(m.title),
        $('<input>').attr({type: 'checkbox', id: m.name + 'modeenable'}),
        $('<aside>').text(m.detail)
      ));
    }
  }

}


/**
 * Set modal message
 *
 * @param {String} txt
 *   Message to display
 * @param {String} mode
 *   Optional extra class to add to message element
 */
function setMessage(txt, mode){
  if (txt) {
    $('b', $stat).text(txt);
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
    // Parse error.. will stick with default
  }
  return bot;
}

/**
 * Early called translate trigger for loading translations and static
 * strings.
 */
function translatePage() {
  // Shoehorn settings HTML into page first...
  // Node Blocking load to get the settings HTML content in
  $('#settings').html(fs.readFileSync('resources/main.settings.inc.html').toString());
  var resources = {};

  // Get all available language JSON files from folders, add to the dropdown
  // list, and add to the rescources available.
  var i = 0;
  var i18nPath = 'resources/i18n/';
  fs.readdirSync(i18nPath).forEach(function(file) {
    // Get contents of the language file.
    try {
      var data = JSON.parse(fs.readFileSync(i18nPath + file , 'utf8'));

      // Create new option in the pulldown language list, with the text being
      // the language's name value is the two letter language code.
      $("#lang").append(
        $("<option>")
          .text(data.settings.lang.name)
          .attr('value', data['_meta'].target)
      );


      // Add the language to the resource list.
      resources[data['_meta'].target] = { translation: data};
      //Create empty colorset key
      resources[data['_meta'].target].translation['colorsets'] = {};

      i += 1;
    } catch(e) {
      console.error('Bad language file:' + file, e);
    }
  });
  console.debug("Found a total of " + i + " language files.");

  // Parsing for colorset translation strings.
  try {
    // Iterate over global colorset i18n directory.
    fs.readdirSync('resources/colorsets/i18n').forEach(function(file) {
      // Add each translation file to the global translate array.
      var data = JSON.parse(fs.readFileSync('resources/colorsets/i18n/' + file , 'utf8'));
      resources[data['_meta'].target].translation['colorsets'] = data;
    });
  }catch(e) {
    // Catch and report errors to the console.
    console.error('Error parsing global colorset translation file: ' + file, e); }

  // Iterate over colorset folder, picking out colorset i18n files and adding
  // them to the translate array.
  fs.readdirSync('resources/colorsets/').forEach(function(folder) {
    try {
      // Ignore files that have extentions (we only want directories).
      // Ignore the 'i18n' directory (it is not a colorset!).
      if (folder.indexOf(".") == -1 && !(folder == "i18n")) {
       // Create a full path to the directory containing this colorset's i18n
       // files.
        var fullPath = 'resources/colorsets/' + folder + '/i18n/';

        //  Iterate over language files in colorset's i18n folder
        fs.readdirSync(fullPath).forEach(function(file) {
          //  Add the data to the global i18n translation array
          var data = JSON.parse(fs.readFileSync(fullPath + file , 'utf8'));
          resources[data['_meta'].target].translation['colorsets'][folder] = data;
        });
       }
  } catch(e) {
    // Catch and report errors to the console
    console.error('Bad or missing Colorset translation file for: ' + folder, e); }
  });

  // Loop over every element in the current document scope that has a 'data-i18n' attribute that's empty
  $('[data-i18n]=""').each(function() {
    // "this" in every $.each() function, is a reference to each selected DOM object from the query.
    // Note we have to use $() on it to get a jQuery object for it. Do that only once and save it in a var
    // to keep your code from having to instantiate it more than once.
    var $node = $(this);
    // Check if the text contains a dot (will prevent it from accidentally
    // overwriitng existing data in i18n attribute) and if the existing
    // i18n attribute is empty
    if ($node.text().indexOf('.') > -1 && $node.attr('data-i18n') == "") {
      $node.attr('data-i18n', $node.text());
      // This leaves the text value of the node intact just in case it doesn't translate and someone is debugging,
      // they'll be able to see the exact translation key that is a problem in the UI.
    }
  });

  i18n.init({
    resStore: resources,
    ns: 'translation'
  }, function(t) {
    robopaint.t = t;
    $('[data-i18n]').i18n();
  });
}

/**
 * Reloads language file and updates any changes to it.
 * Called when the language is changed in the menu list.
 */

function updateLang() {
  // Get the index pointer from the dropdown menu.
  robopaint.settings.lang = $('#lang').val();

  // Abort the subroutine if the language has not changed (or on first load)
  if (currentLang == robopaint.settings.lang) {
      return;
  }

  currentLang = robopaint.settings.lang;

  // Change the language on i18n, and reload the translation variable.
  i18n.setLng(
    robopaint.settings.lang,
    function(t) {
      robopaint.t = t;
      $('[data-i18n]').i18n();

      // Set visible version from manifest (with appended bot type if not WCB)
      // This has to be done here because it's one of the few out of phase translations
      var bt = robopaint.currentBot.type != "watercolorbot" ? ' - ' + robopaint.currentBot.name : '';
      $('span.version').text('('+ robopaint.t('nav.toolbar.version') + gui.App.manifest.version + ')' + bt);
    });
  // Report language switch to the console
  console.info("Language Switched to: " + robopaint.settings.lang);

  //Reload individual parts that handle translations uniquely

  // Initalize/reset Tooltips
  initToolTips();

  // Reload and reparse colorsets
  getColorsets();

  // Apply bolding to details text
  $('aside').each(function(){
    $(this).html($(this).text().replace(/\*\*(\S(.*?\S)?)\*\*/gm, '<b>$1</b>'));
  });
}
