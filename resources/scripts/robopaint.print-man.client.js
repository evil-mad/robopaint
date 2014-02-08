/**
 * @file Holds all RoboPaint manual painting mode specific code
 */


$(function() {
  var $path = {};
  var $svg = $('svg#main');

  $('#drawpoint').hide(); // Hide the drawpoint

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
        $path.addClass('selected');
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
  updateColorSet();

  // Add all the colorsets CSS files
  for(var i in robopaint.statedata.colorsets['ALL']) {
    var set = robopaint.statedata.colorsets['ALL'][i];
    $('<link>').attr({rel: 'stylesheet', href: 'colorsets/' + set + '/' + set + '.css'}).appendTo('head');
  }


  window.bindControls = function() {
    // Ensure buttons are disabled as we have no selection
    $('#draw').prop('disabled', true);
    $('#fill').prop('disabled', true);

    // Add selection from last machine tool
    $('.color, .water').removeClass('selected');
    $('#' + cncserver.state.media).addClass('selected');

    // Pause management
    var pauseText = 'Click to pause buffer running to bot';
    var resumeText = 'Click to resume operations';
    var pausePenState = 0;
    $('#pause').click(function(){

      if (!cncserver.state.process.paused) {
        // Only attempt to status pause if something is going on, but always allow pause
        if (cncserver.state.buffer.length) {
          cncserver.wcb.status('Pausing current process...');
        } else {
          $('#pause').addClass('active').attr('title', resumeText).text('Resume');
        }
        cncserver.state.process.paused = true;
      } else {
        cncserver.state.process.paused = false;

        // Execute next should put us where we need to be
        cncserver.cmd.executeNext(function(){
          // If the pen was down before, put it down now after the resuming command.
          if (pausePenState) {
            cncserver.state.buffer.push('down'); // Add to END of queue
          }
        });

        $('#pause').removeClass('active').attr('title', pauseText).text('PAUSE');
        if (cncserver.state.buffer.length) {
          cncserver.wcb.status('Drawing resumed...', true);
        }
        pausePenState = 0;
      }
    });

    // Pause callback
    cncserver.state.process.pauseCallback = function(){
      // Remember the state, and then make sure it's up
      pausePenState = cncserver.state.pen.state;
      if (pausePenState == 1) {
        cncserver.api.pen.up(_pauseDone);
      } else {
        _pauseDone();
      }

      function _pauseDone() {
        cncserver.wcb.status('Paused. Click resume to continue.', 'complete');
        $('#pause').addClass('active').attr('title', resumeText).text('Resume');
      }
    }

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
      // If we're paused, run it directly, otherwise add to buffer
      if (cncserver.state.process.paused) {
        cncserver.wcb.status('Parking brush...');
        cncserver.api.pen.park(function(d){
          cncserver.wcb.status(['Brush parked succesfully', "Can't Park, already parked"], d);
        });
      } else {
        cncserver.cmd.run('park');
      }
    });

    $('#draw').click(function(){
      $('#draw').prop('disabled', true);
      cncserver.cmd.run([['status', 'Painting along selected path...']]);
      cncserver.paths.runOutline($path, function(){
        if ($('#parkafter').is(':checked')) cncserver.cmd.run('park');
        $('#draw').prop('disabled', false);
        cncserver.cmd.run([['status', 'Painting complete', true]]);
        if (cncserver.config.canvasDebug) {
          $('canvas#debug').show();
        }

      });
    });

    $('#pen').click(function(){
      cncserver.api.pen.height($('#pen').is('.up') ? 0 : 1);
    });

    $('#calibrate').click(function(){
      cncserver.api.pen.move({x: 0, y:0});
    });

    $('#disable').click(function(){
      cncserver.wcb.status('Unlocking motors...');
      cncserver.api.pen.up();
      cncserver.api.pen.zero();
      cncserver.api.motors.unlock(function(d){
        cncserver.wcb.status(['Motors unlocked! Place in home corner when done'], d);
      });
    });
    $('#zero').click(function(){
      cncserver.wcb.status('Absolute position reset', true);
      cncserver.api.pen.zero();
    });

    $('#auto-paint').click(function(){
      // Momentarily hide selection
      if ($path.length) $path.toggleClass('selected');

      $('#auto-paint, #fill, #draw').prop('disabled', true);
      cncserver.wcb.autoPaint($('#cncserversvg'), function(){
        if (cncserver.config.canvasDebug) {
          $('canvas#debug').show();
        }
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
      cncserver.cmd.run([['status', 'Filling selected path...']]);
      cncserver.paths.runFill($path, function(){
        $('#fill').prop('disabled', false);
        if ($('#parkafter').is(':checked')) cncserver.cmd.run('park');
        cncserver.cmd.run([['status', 'Painting complete', true]]);
      });
    });

    // Bind to Recording Buttons
    $('fieldset.recording button').click(function(e){
      if (this.id == 'record-toggle') {
        cncserver.state.isRecording = !cncserver.state.isRecording;
        if (cncserver.state.isRecording) {
          $(this).text('Stop Recording');
        } else {
          $(this).text('Start Recording');
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

    // Move the visible draw position indicator
    cncserver.moveDrawPoint = function(p) {
      // Move visible drawpoint
      var $d = $('#drawpoint');

      $d.show().attr('fill', cncserver.state.pen.state ? '#FF0000' : '#00FF00');

      // Add 48 to each side for 1/2in offset
      $d.attr('transform', 'translate(' + (p.x + 48) + ',' + (p.y + 48) + ')');
    }

    cncserver.hideDrawPoint = function() {
      $('#drawpoint').hide();
    }

    // Add extra dom to allow for specific sub-selection of dip/full paint & water
    $('nav#tools a').each(function(){
      var $t = $(this);

      $('<a>')
        .text('Full')
        .attr('title', 'Full dip and wiggle')
        .addClass('sub-option full')
        .appendTo($t);
      $('<a>')
        .text('Dip')
        .attr('title', 'Single momentary dip')
        .addClass('sub-option dip')
        .appendTo($t);
    });


    // Bind to Tool Change nav items
    $('nav#tools a a').click(function(e){
      var $p = $(this).parent();
      var isDip = $(this).is('.dip'); // Full or dip?
      var toolExt = isDip ? 'dip' : '';

      if ($p.is('.color, .water')) {
        // If we're paused, run it directly, otherwise add to buffer
        if (cncserver.state.process.paused) {
          cncserver.wcb.setMedia($p.attr('id') + toolExt);
          $('nav#tools a.selected').removeClass('selected');
          $p.addClass('selected');
        } else {
          cncserver.cmd.run([['tool', $p.attr('id') + toolExt]]);
        }
      }

      // X clicked: Do a full brush wash
      if ($p.is('#colorx')) {
        // If we're paused, run it directly, otherwise add to buffer
        if (cncserver.state.process.paused) {
          cncserver.wcb.fullWash(null, isDip);
          $('nav#tools a.selected').removeClass('selected');
          $('#water0').addClass('selected');
        } else {
          cncserver.cmd.run([['wash', isDip]]);
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

/**
 * Update the rendering of the colorset
 *
 * This is "outside of the main "global" so robopaint's main.js knows where to
 * find it. Same format for robopaint.method-draw.js
 */
function updateColorSet(){
  var set = robopaint.statedata.colorsets[robopaint.settings.colorset];
  cncserver.config.colors = set.colors;
  $('#colors').attr('class', '').addClass(set.baseClass);
  for (var i in set.colors) {
    $('#color' + i)
      .text(robopaint.settings.showcolortext ? set.colors[i].name : "")
      .attr('title', robopaint.settings.showcolortext ? "" : set.colors[i].name);
  }
}
