/*
 * @file Holds all RoboPaint GLOBAL settings specific configuration, binding and
 * handler code. If a new setting wants to show up in the application, in needs
 * to have its markup added in main.settings.inc.html. This may all eventually move
 * to a more centralized singluar configuration file ... but not yet. ;)
 */


/**
 * Load settings from defaults/localStorage and push to elements
 */
function loadSettings() {
  var g = cncserver.conf.global;
  var b = cncserver.conf.bot;

  // Pull settings over from CNC server / RoboPaint defaults (defined here)
  robopaint.settings = {
    // CNC Server specific settings
    invertx: g.get('invertAxis:x'),
    inverty: g.get('invertAxis:y'),
    swapmotors: g.get('swapMotors'),
    serialpath: g.get('serialPath'),
    httpport: g.get('httpPort'),
    httplocalonly: g.get('httpLocalOnly'),
    latencyoffset: 20,
    servowash: parseFloat(b.get('servo:presets:wash'))*10,
    servopaint: parseFloat(b.get('servo:presets:draw'))*10,
    servoup: parseFloat(b.get('servo:presets:up'))*10,
    servotime: b.get('servo:duration'),
    movespeed: parseFloat(b.get('speed:moving')),
    paintspeed: parseFloat(b.get('speed:drawing')),

    // Robopaint specific defaults
    filltype: 'line-straight',
    fillangle: 0,
    penmode: 0,
    openlast: 0,
    showcolortext: 0,
    colorset: 'generic-standard',
    maxpaintdistance: 8040,
    fillspacing: 10,
    fillprecision: 14,
    strokeovershoot: 5,
    tsprunnertype: 'OPT',
    strokeprecision: 6,
    enabledmodes: {},
    remoteprint: 0,
    gapconnect: 1
  };

  // Allow machine specific overrides of initial default settings
  settingsDefaultAlter(robopaint.settings);

  // Set the visibility/enabled status of color/mediasets
  verifyColorsetAbilities();

  // Are there existing settings from a previous run? Mesh them into the defaults
  if (localStorage[settingsStorageKey()]) {
    var s = getSettings();
    for (var key in robopaint.settings) {
      if (typeof s[key] != 'undefined') {
        robopaint.settings[key] = s[key];
      }
    }
  }

  // Actually match the form elements to the given settings
  for (var key in robopaint.settings) {
    var $input = $('#' + key);
    switch (key) {
      case 'enabledmodes':
        for (var i in robopaint.settings.enabledmodes) {
          $('#' + i + 'modeenable')
            .prop('checked', robopaint.settings.enabledmodes[i])
            .change();
        }
        break;
      default:
        if ($input.attr('type') == 'checkbox') {
          $input.prop('checked', robopaint.settings[key]);
        } else {
          $input.val(robopaint.settings[key]);
        }
    }
    $input.change();
  }

  afterSettings();
}

/**
 * Called after robopaint.settings is initialized with defaults, allows for
 * machine specific overrides of global settings defaults.
 */
function settingsDefaultAlter(settings) {
  var tools = robopaint.currentBot.data.tools;

  // Bot specific switches
  switch (robopaint.currentBot.type) {
    case "eggbot":
      // TODO: Bot specific things should be less important/useful than tool
      // specific changes (as new bots should have the ability to be added in
      // cncserver without needing explicit support in robopaint)
  }

  // Switch pen modes depending on bot's tool abilities
  if (!tools.color0) { // No colors...
    settings.penmode = 1;

    $("#penmode option[value=0]").remove(); // Diable WaterColor Mode

    if (!tools.water0) { // No water or color (Assume Pen only)
      settings.penmode = 3;
      settings.strokeovershoot = 0;
      settings.fillspacing = 1;
      settings.strokeprecision = 6;

      // Force the hand of settings to disable WCB specific options
      // (colorset is handled in verifyColorsetAbilities func)
      $("#penmodes, #overshoot, #maxpaint").hide();
    }
  } else if (!tools.water0) { // Has color, no water
    $("#penmode option[value=0]").remove(); // Diable WaterColor Mode
    $("#penmode option[value=1]").remove(); // Diable Water Mode
    settings.penmode = 2;
  }

}

/**
 * Verify the abilities for a given bot to access/use a given set of media.
 * If no media types can be used by the current bot, the colorset pallette
 * will be completely hidden.
 */
function verifyColorsetAbilities() {
  var tools = robopaint.currentBot.data.tools;
  var bot = robopaint.currentBot.type;

  // Assume bot allows for all media types
  var allowedMedia = {
    watercolor: true,
    pen: true,
    engraver: true,
    wax: true
  };

  // Only Eggbot supports engraver and wax right now
  if (bot !== 'eggbot') {
    allowedMedia.engraver = false;
    allowedMedia.wax = false;
  }

  // Without color, no watercolor
  if (!tools.color0) {
    allowedMedia.watercolor = false;
  }

  // Without manual swap/resume, no pen
  if (!tools.manualswap && !tools.manualresume) {
    allowedMedia.pen = false;
  }

  robopaint.statedata.allowedMedia = allowedMedia;
}

/**
 * Called after settings have been loaded
 */
function afterSettings() {
  addSettingsRangeValues(); // Add in the range value displays

  // Clear last used image
  if (robopaint.settings.openlast == 0) delete localStorage["svgedit-default"];
}

/**
 * Actually retrieve settings from local storage
 */
function getSettings() {
  if (localStorage[settingsStorageKey()]) {
    return JSON.parse(localStorage[settingsStorageKey()]);
  } else {
    return {};
  }
}

/**
 * Get the settings key (based on bot type)
 *
 * @returns {String}
 *   Name of current bot specific settings key
 */
function settingsStorageKey() {
  var t = robopaint.currentBot.type;
  if (t == 'watercolorbot') {
    return 'cncserver-settings';
  } else {
    return t + '-settings';
  }
}

/**
 * Actually save settings to local storage
 */
function saveSettings() {
  localStorage[settingsStorageKey()] = JSON.stringify(robopaint.settings);
}

/**
 * Bind and callback functionality for any settings specific markup/controls
 */
function bindSettingsControls() {
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

  // Pull the list of available bot types
  var botTypes = cncserver.getSupportedBots();
  for (var type in botTypes) {
    var o = $('<option>')
      .attr('value', type)
      .text(botTypes[type].name);

      o.appendTo('select#bottype');
  }
  $('select#bottype').val(robopaint.currentBot.type);



  // Set robopaint global aspect ratio
  var b = botTypes[robopaint.currentBot.type].data;
  robopaint.currentBot.data = b;
  var aspect = (b.maxArea.height - b.workArea.top) / (b.maxArea.width - b.workArea.left);
  robopaint.canvas = {
    width: 1152, // "Trusted" width to base transformations off of
    height: Math.round(1152 * aspect),
    aspect: aspect
  };

  // Setup settings group tabs
  $('ul.tabs').each(function(){
    // For each set of tabs, we want to keep track of
    // which tab is active and its associated content
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

  // Catch all settings input changes
  $('#settings input, #settings select').bind('change input', function(){
    var $input = $(this);
    var pushKey = [];
    var pushVal = '';

    // Do this first as switch case can't use indexOf
    // Update available modes
    if (this.id.indexOf('modeenable') !== -1) {
      var name = this.id.replace('modeenable', '');
      robopaint.settings.enabledmodes[name] = $input.is(':checked');
      $('#' + name + ', #bar-' + name).toggle(robopaint.settings.enabledmodes[name]);
      responsiveResize();
      if (!initializing) saveSettings();
      return;
    }


    switch (this.id) {
      case 'servoup':
      case 'servopaint':
      case 'servowash':
        var name = this.id.substr(5);

        // Shim to translate robopaint name to cncserver name
        if (name == "paint") name = 'draw';

        // Save settings
        cncserver.conf.bot.set('servo:presets:' + name, parseFloat($input.val()/10));
        if (!initializing) cncserver.setHeight(name);
        robopaint.settings[this.id] = $input.val();
        break;

      // TODO: Make the following pull from master pushkey list
      // This would mean a total change in the way this switch is being used,
      // and would remove all the code duplication below, of course it would
      // complicate the simple settings variable structure. Considering that
      // this currently works reasonably well has put it pretty low on the
      // priority list.
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
        pushVal = $input .is(':checked');
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
      case 'penmode':
        // No paint?
        toggleDisableSetting(
          '#showcolortext, #colorset',
          ($input.val() == 2 || $input.val() == 0),
          robopaint.t('settings.output.penmode.warningPaint')
        );

        // No nothing!
        toggleDisableSetting(
          '#maxpaintdistance',
          $input.val() != 3,
          robopaint.t('settings.output.penmode.warningAll')
        );

        robopaint.settings[this.id] = $input.val();
        break;
      case 'bottype': // Bot type change! Not a real setting
        localStorage["currentBot"] = JSON.stringify({
          type: $input.val(),
          name: $('#bottype option:selected').text()
        });
        return;
      case 'lang':
        // localStorage['robopaint-lang'] set in updateLang() [main.js]
        updateLang();
        return;
      default: // Nothing special to set, just change the settings object value
        if ($input.attr('type') == 'checkbox') {
          robopaint.settings[this.id] = $input.is(':checked');
        } else {
          robopaint.settings[this.id] = $input.val();
        }
    }

    // Remoteprint mode click
    if (this.id == 'remoteprint') {
      $('#bar-remoteprint').toggle(robopaint.settings[this.id]);
    }

    // Update paint sets when changes made that would effect them
    if (this.id == 'colorset' || this.id == 'showcolortext') {
      updateColorSetSettings();
      if ($subwindow[0]) {
        if ($subwindow[0].contentWindow.updateColorSet) {
          $subwindow[0].contentWindow.updateColorSet();
        }
      }
    }

    // Update visibility of paintsets on penmode change
    if (this.id == 'penmode') {
      if ($subwindow[0]) {
        if ($subwindow[0].contentWindow.responsiveResize) {
          $subwindow[0].contentWindow.responsiveResize();
        }
      }
    }

    // If there's a key to override for CNC server, set it
    if (pushKey.length) {
      robopaint.settings[this.id] = pushVal;
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
    // Force the pen up when exiting...
    if (appMode == 'print' || appMode == 'manual') {
      // Unless we' have're probably printing something
      if ($subwindow[0].contentWindow.cncserver.state.buffer.length == 0) {
        // Use the more abstracted API to allow sub-app callbacks to handle specifics
        robopaint.cncserver.api.pen.up();
      }
    } else {
      cncserver.setHeight('up');
    }
    setSettingsWindow(false);
  });

  // Keyboard shortcut for exiting settings
  $(window).keydown(function (e){
    if (isModal && $('#settings').is(':visible')) {
      if (e.keyCode == 27) {
        $('#settings-done').click();
      }
    }
  });

  // Reset button
  $('#settings-reset').click(function(e) {
    if (confirm(robopaint.t('settings.buttons.reset.confirm'))) {
      // Disable any non-core modes
      $('.advanced-modes input').prop('checked', false).change();

      delete localStorage[settingsStorageKey()];

      cncserver.loadGlobalConfig();
      cncserver.loadBotConfig();
      loadSettings();
      loadDefaultLang();

    }
  });

  // Fill in the IP Address of local interfaces
  $('#settings div.httpport label span').text(
    robopaint.utils.getIPs(robopaint.settings.httplocalonly)
  );
}

function toggleDisableSetting(selector, toggle, message) {
  $(selector).each(function(){
    var $this = $(this);
    var $parent = $this.parent();

    $this.prop('disabled', !toggle);
    $parent.toggleClass('disabled', !toggle);

    if (!toggle) { // Disable element
      $parent.attr('title', message);
    } else { // Enable element
      $parent.attr('title', '');
    }
  });
}

/**
 * Fade in/out settings modal window
 *
 * @param {Boolean} toggle
 *   True to show window, false to hide.
 */
function setSettingsWindow(toggle) {
  if (toggle) {
    $('#settings').fadeIn('slow');
  } else {
    $('#settings').fadeOut('slow');
  }
  setModal(toggle);
}

/**
 * Adds label markup for range slider controls and controls label conversion
 */
function addSettingsRangeValues() {
  $('input:[type=range]:not(.processed)').each(function(){
    var $r = $(this);
    var $l = $('<label>').addClass('rangeval');

    $r.bind('change input', function(){
      var num = parseInt($r.val());
      var post = "";
      var wrap = ['(', ')'];
      var dosep = true;

      if (['servotime', 'latencyoffset'].indexOf(this.id) != -1) {
        post = " " + robopaint.t('common.time.ms');
      }


      switch (this.id){
        case "servotime":
          num = Math.round(num / 10) * 10;
          break;
        case "maxpaintdistance":
          // Display as Centimeters (16.6667 mm per step!)
          num = Math.round((num / 166.7) * 10) / 10;
          num = num+ ' ' + robopaint.t('common.metric.cm') + ' / ' +
            (Math.round((num / 2.54) * 10) / 10) + ' ' + robopaint.t('common.imperial.in');
          dosep = false;
          break;
        case 'servoup':
        case 'servopaint':
        case 'servowash':
          num = Math.round(num/10);
          dosep = false;
          post = '%';
          break;
        case 'movespeed':
        case 'paintspeed':
          var msg = "";

          if (num < 25) {
            msg = robopaint.t('settings.output.move.speed0');
          } else if (num < 50) {
            msg = robopaint.t('settings.output.move.speed1');
          } else if (num < 75) {
            msg = robopaint.t('settings.output.move.speed2');
          } else if (num < 80) {
            msg = robopaint.t('settings.output.move.speed3');
          } else {
            msg = robopaint.t('settings.output.move.speed4');
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

/**
 * Update/render currently selected colorset in settings window
 */
function updateColorSetSettings() {
  if (!robopaint.statedata.colorsets) return; // Don't run too early

  var set = robopaint.statedata.colorsets[robopaint.settings.colorset];
  if (!set) return; // Don't run if the set is invalid

  var $colors = $('#colorsets .colors');

  // Add Sortable color names/colors
  $colors.empty();
  for (var i in set.colors) {
    if (i == set.colors.length-1) break; // Ignore the last value
    $('<li>')
      .append(
        $('<span>')
          .addClass('color')
          .css('background-color', set.colors[i].color['HEX'])
          .text(' '),
        $('<label>').text(set.colors[i].name)
      ).appendTo($colors);
  }

  // Add metadata
  var meta = 'type name description media'.split(' ');
  for (var i in meta) {
    $('#colorsets .' + meta[i]).text(set[meta[i]]);
  }
}

/**
 * Get default OS language and look if it is in the list of available languages,
 * if not, set default to i18n's defualt languge (English).
 * Called AFTER initial settings reload to
 */
function loadDefaultLang() {
    // Iterate through list of files in language directory
    fs.readdirSync("resources/i18n/").forEach(function(file) {
      // Test if the file is a directory.
      var stat = fs.statSync("resources/i18n/"+file);
      if (stat && stat.isDirectory())

        // Do a RegEx search for the filename in the default system language (this
        // returns an index position or -1 if not found, so we use a conditional
        // to change this to a boolean of whether or not it is in the string).
        var isDefLang = navigator.language.search(file) !== -1;

        // If the language we are iterating is the OS's default language.
        if(isDefLang) {
          // Set the selected language to be the default language
          $("#lang").value = file;
          console.info('Language Reset to:' + file);
        };
    });

}
