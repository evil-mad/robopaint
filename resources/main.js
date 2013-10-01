/**
 * @file Holds all initially loaded and Node.js specific initialization code,
 * central cncserver object to control low-level non-restful APIs, and general
 * "top-level" UI initialization for settings.
 *
 * TODO: This should probably be broken up
 */

global.$ = $;

var fs = require('fs');
var cncserver = require('cncserver');
var gui = require('nw.gui');

var barHeight = 40;
var isModal = false;
var settings = {}; // Holds the "permanent" app settings data
var statedata = {}; // Holds per app session volitile settings
var initializing = false;
var appMode = 'home';
var $subwindow = {}; // Placeholder for subwindow iframe
var subWin = {}; // Placeholder for subwindow "window" object

// Set the global scope object for any robopaint level details
var robopaint = {};

// Option buttons for connections
// TODO: Redo this is a message management window system!!!
var $options;
var $stat;

// Pull the list of available ports
cncserver.getPorts(function(ports) {
  for (var portID in ports){
    var o = $('<option>')
      .attr('value', ports[portID].comName)
      .attr('title', ports[portID].pnpId);
    o.text(ports[portID].comName);

    o.appendTo('select#ports');
  }
});

/**
 * Central home screen initialization function
 */
function initialize() {
  initializing = true;

  gui.Window.get().on('close', onClose); // Catch close event

  // Bind settings controls
  bindSettingsControls();

  // Load up initial settings!
  loadSettings();

  // Load the quickload list
  initQuickload();

  // Bind the tooltips
  initToolTips();

  // Add the secondary page iFrame to the page
  $subwindow = $('<iframe>').attr({
    height: $(window).height() - barHeight,
    border: 0,
    id: 'subwindow'
  }).css('top', $(window).height()).hide();

  $subwindow.appendTo('body');

  $(window).resize(function(){
    // Position settings window dead center
    var $s = $('#settings');
    var size = [$s.width(), $s.height()];
    var win = [$(window).width(), $(window).height()];
    $s.css({left: (win[0]/2) - (size[0]/2), top: (win[1]/2) - (size[1]/2)});

    // Set subwindow height
    $subwindow.height($(window).height() - barHeight);
  });

  $(window).resize(); // Initial resize

  // Prep the connection status overlay
  $stat = $('body.home h1');
  $options = $('<div>').addClass('options')
        .text('What do you want to do?').hide();
  $options.append(
    $('<div>').append(
      $('<button>').addClass('continue').click(function(e){
        $stat.fadeOut('slow');
        cncserver.continueSimulation();
        cncserver.serialReadyInit();

        if (initializing) {
          // Initialize settings...
          loadSettings();
          saveSettings();
          initializing = false;
        }

        setModal(false);
      }).text('Continue in Simulation mode'),

      $('<button>').addClass('reconnect').click(function(e){
        // Reconnect! Basically Resets status and tries start aagain
        $options.hide();
        startSerial();
      }).text('Try to Reconnect')
    )
  );
  $options.appendTo($stat);

  // Actually try to init the connection and handle the various callbacks
  startSerial();

}

function startSerial(){
  setMessage('Starting up...', 'loading');

  cncserver.start({
    success: function() {
      setMessage('Port found, connecting...');
    },
    error: function(err) {
      setMessage('Couldn\'t connect! - ' + err, 'warning');
      $options.slideDown('slow');
    },
    connect: function() {
      setMessage('Connected!', 'success');

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

    },
    disconnect: function() {
      setModal(true);
      $stat.show();
      setMessage('Bot Disconnected!', 'error');
      $options.slideDown();
    }
  });
}

// By just having this function prevents gui Window close...
function onClose() {
  var w = this;

  checkModeClose(function(){
    w.close(true); // Until this is called
  }, true);
}

// Runs subwindow close delay functions, runs callback when done.
// isGlobal demarks a application level quit
function checkModeClose(callback, isGlobal, destination) {
  // Settings mode not considered mode closer
  if (destination == 'settings') {
    callback(); return;
  }

  if (appMode == 'print' || appMode == 'edit') {
    subWin.onClose(callback, isGlobal);
  } else {
    callback();
  }
}

// Bind the toolbar button tool tips
function initToolTips() {

  function beforeQtip(){
    // Move position to be more centered for outer elements
    if (this.id <= 1) {
      this.elements.wrapper.parent().css('margin-left', -30);
    }

    if (this.getPosition().left + this.getDimensions().width + 250 > $(window).width()) {
      this.elements.wrapper.parent().css('margin-left', 30);
    }

  }

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
  });
}

// Initialize and bind Quickload file list
function initQuickload() {
  var $load = $('#bar-load');
  var $loadList = $('#loadlist');
  var paths = ['resources/svgs'];

  // TODO: Support user directories off executable
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


// When the window is done loading, it will call this.
function fadeInWindow() {
  if ($subwindow.offset().top != barHeight) {
    $subwindow.hide().css('top', barHeight).fadeIn('slow');
  }
  subWin = $subwindow[0].contentWindow;
}

// Document Ready...
$(function() {
  initialize();

  getColorsets(); // Load the colorset configuration data

  // Bind links for home screen central links
  $('nav a').click(function(e) {
     $('#bar-' + e.target.id).click();
    return false;
  });

  // Bind links for toolbar
  $('#bar a.mode').click(function(e) {
    checkModeClose(function(){
      var $target = $(e.target);
      var mode = $target[0].id.split('-')[1];

      if (mode != 'settings') appMode = mode;

      // Don't do anything fi already selected
      if ($target.is('.selected')) {
        return false;
      }

      // Don't select settings (as it's a modal on top window)
      if (mode !== 'settings') {
        $('#bar a.selected').removeClass('selected');
        $target.addClass('selected');
      }

      switch (mode) {
        case 'home':
          $subwindow.fadeOut('slow', function(){$subwindow.attr('src', "");});
          break;
        case 'settings':
          setSettingsWindow(true);
          break
        default:
          $subwindow.attr('src', $target.attr('href'));
      }
    }, false, e.target.id.split('-')[1]);

    return false;
  });

  // Bind help click (it's special)
  $('#bar-help').click(function(){
    gui.Shell.openExternal(this.href);
    return false;
  });

})

// Fetches all watercolor sets available from the colorsets dir
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

  statedata.colorsets = {'ALL': sets};

  $.each(sets, function(i, set){
    var setDir = colorsetDir + set + '/';
    var c = JSON.parse(fs.readFileSync(setDir + set + '.json'));

    $('#colorset').append(
      $('<option>')
        .attr('value', set)
        .text(c.name)
        .prop('selected', set == settings.colorset)
    );

    // Add pure white to the end of the color set for auto-color
    c.colors.push({'White': '#FFFFFF'});

    // Process Colors to avoid re-processing later
    var colorsOut = [];
    for (var i in c.colors){
      var name = Object.keys(c.colors[i])[0];
      var h = c.colors[i][name];
      var r = robopaint.utils.colorStringToArray(h);
      colorsOut.push({
        name: name,
        color: {
          HEX: h,
          RGB: r,
          HSL: robopaint.utils.rgbToHSL(r),
          YUV: robopaint.utils.rgbToYUV(r)
        }
      });
    }

    statedata.colorsets[set] = {
      name: c.name,
      baseClass: c.styles.baseClass,
      colors: colorsOut,
      stylesheet: $('<link>').attr({rel: 'stylesheet', href: setDir + c.styles.src})
    };
  });
}

function addSettingsRangeValues() {
  $('input:[type=range]:not(.processed)').each(function(){
    var $r = $(this);
    var $l = $('<label>').addClass('rangeval');

    $r.change(function(){
      var num = parseInt($r.val());
      var post = "";
      var wrap = ['(', ')'];
      var dosep = true;

      if (['servotime', 'latencyoffset'].indexOf(this.id) != -1) {
        post = " ms"
      }


      switch (this.id){
        case "servotime":
          num = Math.round(num / 10) * 10;
          break;
        case "maxpaintdistance":
          // Display as Centimeters (16.6667 mm per step!)
          num = Math.round((num / 166.7) * 10) / 10;
          num = num+ ' cm / ' + (Math.round((num / 2.54) * 10) / 10) + ' in';
          dosep = false;
          break;
        case 'servolift':
        case 'servodrop':
          var b = this.max - this.min;
          var x = num - this.min;
          num = Math.round((x * 100) / b);
          post = '%';
          break;
        case 'movespeed':
        case 'paintspeed':
          num = Math.round((num / this.max) * 100);
          var msg = "";

          if (num < 25) {
            msg = "Paintbrush on a Snail";
          } else if (num < 50) {
            msg = "Painfully Slow";
          } else if (num < 75) {
            msg = "Medium";
          } else if (num < 80) {
            msg = "Fast (default)";
          } else {
            msg = "Stupid Fast!";
          }

          dosep = false;
          wrap = ['', ''];
          post = "% - " + msg;
          break;
      }

      if (dosep) num = num.toString(10).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

      $l.text(wrap[0] + num + post + wrap[1]);
    }).change();

    $r.addClass('processed').after($l);
  })
}

/*========================== Settings Management =============================*/

// Load settings from storage and push to elements (only happens at startup)
function loadSettings() {
  var g = cncserver.conf.global;
  var b = cncserver.conf.bot;

  // Pull settings over from CNC server / RoboPaint defaults (defined here)
  settings = {
    // CNC Server specific settings
    invertx: g.get('invertAxis:x'),
    inverty: g.get('invertAxis:y'),
    swapmotors: g.get('swapMotors'),
    serialpath: g.get('serialPath'),
    httpport: g.get('httpPort'),
    httplocalonly: g.get('httpLocalOnly'),
    latencyoffset: 20,
    servodrop: b.get('servo:min'),
    servolift: b.get('servo:max'),
    servotime: b.get('servo:duration'),
    movespeed: b.get('speed:moving'),
    paintspeed: b.get('speed:drawing'),

    // Robopaint specific defaults
    filltype: 'line-straight',
    fillangle: 0,
    penmode: 0,
    openlast: 0,
    showcolortext: 0,
    colorset: 'crayola_classic',
    maxpaintdistance: 8040,
    fillspacing: 10,
    fillprecision: 14,
    strokeovershoot: 5,
    tsprunnertype: 'OPT',
    strokeprecision: 6,
    gapconnect: 1
  };

  // Are there existing settings from a previous run? Mesh them into the defaults
  if (localStorage["cncserver-settings"]) {
    var s = JSON.parse(localStorage["cncserver-settings"]);
    for (var key in settings) {
      if (typeof s[key] != 'undefined') {
        settings[key] = s[key];
      }
    }
  }

  // Actually match the form elements to the given settings
  for (var key in settings) {
    var $input = $('#' + key);
    switch (key) {
      default:
        if ($input.attr('type') == 'checkbox') {
          $input.prop('checked', settings[key]);
        } else {
          $input.val(settings[key]);
        }
    }
    $input.change();
  }

  afterSettings();
}

// Call anything that needs to happen after settings have been loaded
function afterSettings() {
  addSettingsRangeValues(); // Add in the range value displays

  // Clear last used image
  if (settings.openlast == 0) delete localStorage["svgedit-default"];
}

// Actually save settings to local storage
function saveSettings() {
  localStorage["cncserver-settings"] = JSON.stringify(settings);
}

/*======== Direct Settings Bindings!  =========*/
function bindSettingsControls() {

  // Setup settings group tabs
  $('ul.tabs').each(function(){
    // For each set of tabs, we want to keep track of
    // which tab is active and it's associated content
    var $active, $content, $links = $(this).find('a');

    // If the location.hash matches one of the links, use that as the active tab.
    // If no match is found, use the first link as the initial active tab.
    $active = $($links.filter('[href="'+location.hash+'"]')[0] || $links[0]);
    $active.addClass('active');
    $content = $($active.attr('href'));

    // Hide the remaining content
    $links.not($active).each(function () {
      $($(this).attr('href')).hide();
    });

    // Bind the click event handler for tabs
    $(this).on('click', 'a', function(e){
      // Make the old tab inactive.
      $active.removeClass('active');
      $content.hide();

      // Update the variables with the new link and content
      $active = $(this);
      $content = $($(this).attr('href'));

      // Make the tab active.
      $active.addClass('active');
      $content.show();

      // Prevent the anchor's default click action
      e.preventDefault();
    });
  });


  // Keyboard shortcut for exiting window
  $(window).keydown(function (e){
    if (isModal) {
      if (e.keyCode == 27) {
        $('#settings-done').click();
      }
    }
  });

  // Catch all settings input changes
  $('#settings input, #settings select').change(function(){
    var $input = $(this);
    var pushKey = [];
    var pushVal = '';

    switch (this.id) {
      case 'servolift':
      case 'servodrop':
        var setID = 4;
        var penState = 1;
        if (this.id == 'servodrop') {
          setID = 5;
          penState = 0;
        }

        cncserver.sendSetup(setID, $input.val());
        if (!initializing) cncserver.setPen(penState);

        // Save settings
        settings[this.id] = $input.val();
        break;

      // TODO: Make the following pull from paster pushkey list
      case 'invertx':
        pushKey = ['g', 'invertAxis:x'];
        pushVal = $input.is(':checked');
        break;
      case 'inverty':
        pushKey = ['g', 'invertAxis:y'];
        pushVal = $input.is(':checked');
        break;
      case 'swapmotors':
        pushKey = ['g', 'swapMotors'];
        pushVal = $input.is(':checked');
        break;
      case 'httpport':
        pushKey = ['g', 'httpPort'];
        pushVal = $input.val();
        break;
      case 'httplocalonly':
        pushKey = ['g', 'httpLocalOnly'];
        pushVal = $input.is(':checked');
        break;
      case 'latencyoffset':
        pushKey = ['g', 'bufferLatencyOffset'];
        pushVal = parseInt($input.val());
        break;
      case 'servotime':
        pushKey = ['b', 'servo:duration'];
        pushVal = parseInt($input.val());
        break;
      case 'movespeed':
        pushKey = ['b', 'speed:moving'];
        pushVal = parseInt($input.val());
        break;
      case 'paintspeed':
        pushKey = ['b', 'speed:drawing'];
        pushVal = parseInt($input.val());
        break;
        // Doesn't break on purpose!
      default: // Nothing special to set, just change the settings object value
        if ($input.attr('type') == 'checkbox') {
          settings[this.id] = $input.is(':checked');
        } else {
          settings[this.id] = $input.val();
        }
    }

    if (this.id == 'colorset' || this.id == 'showcolortext') {
      if ($subwindow[0]) {
        if ($subwindow[0].contentWindow.updateColorSet) {
          $subwindow[0].contentWindow.updateColorSet();
        }
      }
    }

    // If there's a key to override for CNC server, set it
    if (pushKey.length) {
      settings[this.id] = pushVal;
      if (pushKey[0] == 'b') { // Bot!
        cncserver.conf.bot.set(pushKey[1], pushVal);
      } else { // Global conf
        cncserver.conf.global.set(pushKey[1], pushVal);
      }
    }

    if (!initializing) saveSettings();
  });

  // Done Button
  $('#settings-done').click(function(e) {
    setSettingsWindow(false);
  });
}

/**
 * Fade in/out settings modal window
 */
function setSettingsWindow(toggle) {
  if (toggle) {
    $('#settings').fadeIn('slow');
  } else {
    $('#settings').fadeOut('slow');
  }
  setModal(toggle);
}

// Modal message setting functions
// TODO: Do this far better
function setMessage(txt, mode){
  if (txt) {
    $('b', $stat).text(txt);
  }

  if (mode) {
    $stat.attr('class', mode);
  }

}

function setModal(toggle){
  if (toggle) {
    $('#modalmask').fadeIn('slow');
  } else {
    $('#modalmask').fadeOut('slow');
  }

  isModal = toggle;
}
