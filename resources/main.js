global.$ = $;

var cncserver = require('cncserver');
var barHeight = 40;
var isModal = false;
var settings = {};
var initalizing = false;
$subwindow = {}; // Placeholder for subwindow iframe

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
  initalizing = true;

  // Bind settings controls
  bindSettingsControls();

  // Add the secondary page iFrame to the page
  $subwindow = $('<iframe>').attr({
    height: $(window).height()-barHeight,
    border: 0,
    id: 'subwindow'
  }).css('top', $(window).height()).hide();

  $subwindow.appendTo('body');

  $(window).resize(function(){
    $subwindow.height($(window).height()-barHeight);
  });

  // Prep the connection status overlay
  var $stat = $('body.home h1');

  var $opt = $('<div>').addClass('options')
        .text('What do you want to do?');
  $opt.append(
    $('<div>').append(
      $('<button>').addClass('continue').click(function(e){
        $stat.fadeOut('slow');
        cncserver.continueSimulation();
        cncserver.serialReadyInit();

        // Initialize settings...
        loadSettings();
        saveSettings();
        initalizing = false;
        setModal(false);
      }).text('Continue in Simulation mode'),

      $('<button>').addClass('reconnect').click(function(e){
        // TODO: Reconnect!
        setSettingsWindow(true);
      }).text('Try to Reconnect')
    )
  );

  // Actually try to init the connection and handle the various callbacks
  cncserver.start({
    success: function() {
      $stat.text('Port found, connecting...');
    },
    error: function(err) {
      $stat.attr('class', 'warning')
        .text('Couldn\'t connect! - ' + err);
      $opt.appendTo($stat);
    },
    connect: function() {
      $stat.text('Connected!')
        .attr('class', 'success')
        .fadeOut('slow');
      setModal(false);
      $('body.home nav').fadeIn('slow');

      // Initialize settings...
      loadSettings();
      saveSettings();
      initalizing = false;
    },
    disconnect: function() {
      setModal(true);
      $stat.show()
        .attr('class', 'error')
        .text('Bot Disconnected!');
      $opt.appendTo($stat);
    }
  });
}

// When the window is done loading, it will call this.
function fadeInWindow() {
  if ($subwindow.offset().top != barHeight) {
    $subwindow.hide().css('top', barHeight).fadeIn('slow');
  }
}

// Document Ready...
$(function() {
  initialize();

  // Bind links for home screen central links
  $('nav a').click(function(e) {
    // Start the iframe loading, stuck at the bottom of the window...
     $('#bar-' + e.target.id).click();
    return false;
  });

  // Bind links for toolbar
  $('#bar a').click(function(e) {
    var $target = $(e.target);
    var id = $target[0].id;

    // Don't do anything fi already selected
    if ($target.is('.selected')) {
      return false;
    }

    // Don't select settings (as it's a modal on top window)
    if (id !== 'bar-settings') {
      $('#bar a.selected').removeClass('selected');
      $target.addClass('selected');
    }

    switch (id) {
      case 'bar-home':
        $subwindow.fadeOut('slow');
        break;
      case 'bar-settings':
        setSettingsWindow(true);
        break
      default:
        $subwindow.attr('src', $target.attr('href'));
    }
    return false;
  });
})

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
    latencyoffset: g.get('bufferLatencyOffset'),
    servodrop: b.get('servo:min'),
    servolift: b.get('servo:max'),
    servotime: b.get('servo:duration'),
    movespeed: b.get('speed:moving'),
    paintspeed: b.get('speed:drawing'),

    // Robopaint specific defaults
    filltype: 'line-straight',
    fillangle: 0,
    penmode: 0,
    maxpaintdistance: 8000,
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
}

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
        if (!initalizing) cncserver.setPen(penState);

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
      case 'latencyoffset':
        pushKey = ['g', 'bufferLatencyOffset'];
        pushVal = $input.val();
        break;
      case 'servotime':
        pushKey = ['b', 'servo:duration'];
        pushVal = $input.val();
        break;
      case 'movespeed':
        pushKey = ['b', 'speed:moving'];
        pushVal = $input.children(':selected').val();
        break;
      case 'paintspeed':
        pushKey = ['b', 'speed:drawing'];
        pushVal = $input.children(':selected').val();
        break;
      default: // Nothing special to set, just change the settings object value
        if ($input.attr('type') == 'checkbox') {
          settings[this.id] = $input.is(':checked');
        } else {
          settings[this.id] = $input.val();
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

    if (!initalizing) saveSettings();
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

function setModal(toggle){
  if (toggle) {
    $('#modalmask').fadeIn('slow');
  } else {
    $('#modalmask').fadeOut('slow');
  }

  isModal = toggle;
}
