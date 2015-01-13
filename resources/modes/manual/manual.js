/**
 * @file Holds all RoboPaint manual painting mode specific code
 */

robopaintRequire(['jquery.svg', 'jquery.svgdom', 'svgshared', 'wcb', 'commander', 'paths'],
function($, robopaint, cncserver) {
  /**
   * Update the rendering of the colorset
   *
   * This is "outside of the main "global" so robopaint's main.js knows where to
   * find it. Same format for robopaint.method-draw.js
   */
  window.updateColorSet = function(){
    var set = robopaint.statedata.colorsets[robopaint.settings.colorset];
    cncserver.config.colors = set.colors;
    $('#colors').attr('class', '').addClass(set.baseClass);
    for (var i in set.colors) {
      $('#color' + i)
        .text(robopaint.settings.showcolortext ? set.colors[i].name : "")
        .attr('title', robopaint.settings.showcolortext ? "" : set.colors[i].name);
    }
  }

$(function() {
  // Shortener function for referencing modes translation string roots :)
  function t(s) { return robopaint.t("modes.print." + s); }   // Print mode
  function mt(s) { return robopaint.t("modes.manual." + s); } // Manual mode

  var $path = {};
  var $svg = $('svg#main');

  // Add in a callback for when loading is complete
  cncserver.canvas.loadSVGCallback = function(){
    // Initialize the record buffer
    cncserver.state.recordBuffer = [];

    // Bind SVG path elements click for $path select/deselect
    $svg.click(function(e){
      var selected = false;

      // If the target of the click matches the wrapper, deslect
      if (e.target == this) {
        if ($path.length) {
          $path.removeClass('selected');
          delete($path);
        }
      } else { // Otherwise, select
        selected = true;
        if ($path.length)$path.removeClass('selected');

        $path = $(e.target);
        robopaint.utils.addShortcuts($path);
        $path.addClass('selected').addClass('ants');
        cncserver.path = $path;
      }

      // Enable/disable buttons if selected/not
      $('#draw').prop('disabled', !selected);
      $('#fill').prop('disabled', !selected);

      e.stopPropagation(); // Don't bubble up and select groups
    });
  }
  cncserver.canvas.loadSVG(); // Load the default SVG (must happen after callback is added ^)

  // Fit the canvas and other controls to the screen size
  responsiveResize();
  setTimeout(responsiveResize, 500);
  $(window).resize(responsiveResize);

  // Initial run to render existing colorsets ---
  window.updateColorSet();

  // Add all the colorsets CSS files
  for(var i in robopaint.statedata.colorsets) {
    var set = robopaint.statedata.colorsets[i];
    $('<link>').attr({rel: 'stylesheet', href: set.styleSrc.replace("resources/",'../../')}).appendTo('head');
  }

  // Externally accessible bind controlls trigger for robopaint.mode.svg to call
  window.bindControls = function() {
    // Ensure buttons are disabled as we have no selection
    $('#draw').prop('disabled', true);
    $('#fill').prop('disabled', true);

    // Add selection from last machine tool
    $('.color, .water').removeClass('selected');
    $('#' + cncserver.state.media).addClass('selected');

    // Cancel Print
    $('#cancel').click(function(){
      var cancelPrint = confirm(t("status.confirm"));
      if (cancelPrint) {
        unBindEvents(function(){
          robopaint.switchMode('home', function(){
            robopaint.switchMode('manual');
          });
        });
      }
    });

    // Bind pause click and functionality
    $('#pause').click(function(){
      // Are we paused already?
      if (!cncserver.state.process.paused) { // Not paused
        // Only attempt to status pause if something is going on, but always allow pause

        if (cncserver.state.buffer.length !== 0) {
          $('#pause').prop('disabled', true).attr('title', t('status.wait'));
          cncserver.wcb.status('Pausing current process...');
        }

        robopaint.cncserver.api.buffer.pause(function(){
          cncserver.wcb.status('Paused. Click resume to continue.', 'complete');
          //$('#buttons button.normal').prop('disabled', false); // Enable options
          $('#pause')
            .addClass('active')
            .attr('title',  t('status.resume'))
            .prop('disabled', false)
            .text(robopaint.t("common.action.resume"));
        });
      } else { // We are paused... resume
        // Resuming ===============
        //$('#buttons button.normal').prop('disabled', true); // Disable options
        cncserver.wcb.status(t("status.resuming"));
        robopaint.cncserver.api.buffer.resume(function(){
          $('#pause')
            .removeClass('active')
            .attr('title', t("status.pause"))
            .text(robopaint.t('common.action.pause'));
          cncserver.wcb.status(t("status.resumed"), true);
        });
      }
    });

    // Bind sim view click
    $('#showsim, #sim').click(function(e) {
      if ($('#sim:visible').length) {
        $('#sim').hide();
      } else {
        cncserver.wcb.simulateBuffer();
      }
    });

    // Setup settings group tabs
    $('ul.tabs').each(function(){
      var $links = $(this).find('a');

      var $active = $($links[0]);
      $active.addClass('active');
      var $content = $($active.attr('href'));

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


    // Bind to control buttons
    $('#park').click(function(){
      // If we're paused, skip the buffer
      cncserver.wcb.status(t("status.parking"));
      robopaint.cncserver.api.pen.park(function(d){
        cncserver.wcb.status([t("status.parked"), t("status.parkfail")], d);
      }, {skipBuffer: cncserver.state.process.paused ? 1 : ''});
    });

    // Bind stroke selected object button
    $('#draw').click(function(){
      $('#draw').prop('disabled', true);
      cncserver.cmd.run('status', mt('status.stroke'));
      $path.removeClass('ants'); // Can't stroke with ants! Screws up visibility

      cncserver.paths.runOutline($path, function(){
        cncserver.cmd.sendComplete(function(){
          if ($('#parkafter').is(':checked')) cncserver.cmd.run('park');
          $('#draw').prop('disabled', false);
          $path.addClass('ants');
          cncserver.cmd.run('status', mt('status.complete'));

          if (cncserver.config.canvasDebug) {
            $('canvas#debug').show();
          }
        });
      });
    });

    // Bind various buttons
    $('#pen').click(function(){
      // Run height pos into the buffer, or skip buffer if paused
      var newState = 0;
      if (cncserver.state.actualPen.state === "up" || cncserver.state.actualPen.state === 0) {
        newState = 1;
      }

      robopaint.cncserver.api.pen.height(newState, null, {
        skipBuffer: cncserver.state.process.paused ? 1 : ''
      });
    });

    $('#calibrate').click(function(){
      // Move to calibrate position via buffer, or skip if paused
      var point = cncserver.wcb.getPercentCoord({x: 0, y:0});
      point.skipBuffer = cncserver.state.process.paused ? 1 : '';
      robopaint.cncserver.api.pen.move(point);
    });

    // Motor unlock: Also lifts pen and zeros out.
    $('#disable').click(function(){
      cncserver.wcb.status(t("status.unlocking"));
      robopaint.cncserver.api.pen.up();
      robopaint.cncserver.api.pen.zero();
      robopaint.cncserver.api.motors.unlock(function(d){
        cncserver.wcb.status([t("status.unlocked")], d);
      });
    });

    $('#zero').click(function(){
      cncserver.wcb.status(mt('status.zero'), true);
      robopaint.cncserver.api.pen.zero();
    });

    $('#auto-paint').click(function(){
      // Momentarily hide selection
      if ($path.length) $path.toggleClass('selected').removeClass('ants');

      $('#auto-paint, #fill, #draw').prop('disabled', true);
      cncserver.wcb.autoPaint($('#cncserversvg'), function(){
        if (cncserver.config.canvasDebug) {
          $('canvas#debug').show();
        }
        if ($path.length) $path.toggleClass('selected').addClass('ants');
        $('#auto-paint, #fill, #draw').prop('disabled', false);
      });

    });

    $('#auto-color').click(function(){
      // Momentarily hide selection
      if ($path.length) $path.toggleClass('selected');

      $(this).toggleClass('undo');
      robopaint.utils.autoColor($('#cncserversvg'), !$(this).is('.undo'), cncserver.config.colors);

      // Bring back selection
      if ($path.length) $path.toggleClass('selected');
    });

    // Checkvisibility Checkbox
    $('#checkvisibility').change(function(){
      cncserver.config.checkVisibility = $(this).is(':checked');
    });

    // Bind to fill controls
    $('#fill').click(function(){
      $('#fill').prop('disabled', true);
      cncserver.cmd.run('status', mt('status.fill'));
      cncserver.paths.runFill($path, function(){
        $('#fill').prop('disabled', false);
        if ($('#parkafter').is(':checked')) cncserver.cmd.run('park');
        cncserver.cmd.run('status', mt('status.complete'));
      });
    });

    // Bind to Recording Buttons
    $('fieldset.recording button').click(function(e){
      if (this.id == 'record-toggle') {
        cncserver.state.isRecording = !cncserver.state.isRecording;
        if (cncserver.state.isRecording) {
          $(this).text(mt('commands.buffer.stop'));
        } else {
          $(this).text(mt('commands.buffer.record'));
          if (cncserver.state.recordBuffer.length) {
            $('#record-play, #record-clear').prop('disabled', false);
          }
        }
      } else if (this.id == 'record-play') {
        $.merge(cncserver.state.buffer, cncserver.state.recordBuffer);
      } else if (this.id == 'record-clear') {
        cncserver.state.recordBuffer = [];
        $('#record-play, #record-clear').prop('disabled', true);
      }
    });

    // Add extra dom to allow for specific sub-selection of dip/full paint & water
    $('nav#tools a').each(function(){
      var $t = $(this);

      $('<a>')
        .text('Full')
        .attr('title', mt('commands.full'))
        .addClass('sub-option full')
        .appendTo($t);
      $('<a>')
        .text('Dip')
        .attr('title', mt('commands.dip'))
        .addClass('sub-option dip')
        .appendTo($t);
    });

    // Bind to Tool Change nav items
    $('nav#tools a a').click(function(e){
      var $p = $(this).parent();
      var isDip = $(this).is('.dip'); // Full or dip?
      var toolExt = isDip ? 'dip' : '';

      if ($p.is('.color, .water')) {
        cncserver.cmd.run('media', $p.attr('id') + toolExt);
      }

      // X clicked: Do a full brush wash
      if ($p.is('#colorx')) {
        // If we're paused, run it directly, otherwise add to buffer
        if (cncserver.state.process.paused) {
          cncserver.wcb.fullWash(function(){
            robopaint.cncserver.api.pen.park();
          }, isDip);
          $('nav#tools a.selected').removeClass('selected');
          $('#water0').addClass('selected');
        } else {
          cncserver.cmd.run([['wash', isDip], 'park']);
        }
      }

      return false;
    });
  }

  // Externalize for remote triggering
  window.responsiveResize = responsiveResize;
  function responsiveResize(){
    var w = $(window).width();
    var h = $(window).height();

    // These value should be static, set originally from central canvas config
    var mainOffset = {
      top: 30,
      left: 20
    };

    var toolScale = 1.3;
    var toolRightMargin = 5;
    var $tools = $('#tools');
    var controlLeftMargin = 60;
    var mode = robopaint.settings.penmode;

    // Allow Water
    if (mode == 0 || mode == 1) {
      $('#waters').css('visibility', 'visible');
    }

    // Allow Paint
    if (mode == 0 || mode == 2) {
      $('#colors').css('visibility', 'visible');
    }

    // Hide Water
    if (mode == 3 || mode == 2) {
      $('#waters').css('visibility', 'hidden');
    }

    // Hide Paint
    if (mode == 3 || mode == 1) {
      $('#colors').css('visibility', 'hidden');
    }

    // Scale tools to height match full size canvas
    $tools.css('-webkit-transform', 'scale(' + toolScale + ')');
    var toolWidth = $tools.width() * toolScale;

    // Nothing shown? Don't take up any room
    if (mode == 3) {
      toolWidth = 0;
      $svg.add('#shadow').css('left', 0);
    } else {
      $svg.add('#shadow').css('left', 256);
    }

    // Calculate scale for both width and height...
    var scale = {
      x: (w - ($('#control').width() + controlLeftMargin)) / (cncserver.canvas.width + toolWidth + toolRightMargin),
      y: (h - (mainOffset.top + 40)) / cncserver.canvas.height
    }

    // ...use the smaller of the two
    cncserver.canvas.scale = scale.x < scale.y ? scale.x : scale.y;

    $('#scale-container') // Actually do the scaling
      .css('-webkit-transform', 'scale(' + cncserver.canvas.scale + ')');

    // TODO: Find out where these inconsistencies in size/position come from
    cncserver.canvas.offset.left = mainOffset.left + ((toolWidth + toolRightMargin) * cncserver.canvas.scale);
    cncserver.canvas.offset.top = mainOffset.top + 1;
  }

});

}); // End RequireJS init
