/**
 * @file Holds all CNC Server central controller objects and DOM management code
 */

var cncserver = {
  canvas: {
    height: 0,
    width: 0,
    scale: 1,
    offset: {
      top: 20,
      left: 235
    }
  },
  state: {
    pen: {},
    buffer: [], // Hold commands to be interpreted as free operations come
    color: 'color1', // Default color selection
    process: {
      name: 'idle',
      waiting: false,
      busy: false,
      paused: false,
      max: 0
    }
  },
  settings: window.parent.settings,
  statedata: window.parent.statedata,
  config: {
    colors: [],
    colorsYUV: []
  }
};


$(function() {
  var $path = {};
  var $svg = $('svg#main');

  serverConnect(); // "Connect", and get the initial pen state
  bindControls(); // Bind all clickable controls
  loadSVG(); // Load the default SVG
  $('#drawpoint').hide(); // Hide the drawpoint

  loadColorsets(); // Get & Load the colorsets, then cache the default

  // Store the canvas size
  cncserver.canvas.height = $svg.height();
  cncserver.canvas.width = $svg.width();

  // Fit the canvas and other controls to the screen size
  responsiveResize();
  setTimeout(responsiveResize, 500);
  $(window).resize(responsiveResize);

  // Initial server connection handler
  function serverConnect() {
    // Get initial pen data from server
    cncserver.utils.status('Connecting to bot...');
    cncserver.api.pen.stat(function(d){
      cncserver.utils.status(['Connected Successfully!'], d);
      cncserver.state.pen.state = 1; // Assume down
      cncserver.api.pen.up(); // Send to put up
      cncserver.state.pen.state = 0; // Assume it's up (doesn't return til later)

      // Set the Pen state button
      $('#pen').addClass(!cncserver.state.pen.state ? 'down' : 'up');

      // Select tool from last machine tool
      if (cncserver.state.pen.tool) {
        $('.color').removeClass('selected');
        if (cncserver.state.pen.tool.indexOf('color') !== -1) {
          cncserver.state.color = cncserver.state.pen.tool;
          $('#' + cncserver.state.pen.tool).addClass('selected');
        } else {
          $('#' + cncserver.state.color).addClass('selected');
        }
      }
    });
  }

  // Load in the colorset data
  function loadColorsets() {
    for(var i in cncserver.statedata.colorsets['ALL']) {
      var set = cncserver.statedata.colorsets[cncserver.statedata.colorsets['ALL'][i]];
      $('head').append(set.stylesheet);
    }

    updateColorSet();
  }

  cncserver.updateColorSet = updateColorSet;
  function updateColorSet(){
    var set = cncserver.statedata.colorsets[cncserver.settings.colorset];
    $('#colors').attr('class', '').addClass(set.baseClass);
    for (var i in set.colors) {
      $('#color' + i)
        .text(cncserver.settings.showcolortext ? set.colors[i] : "")
        .attr('title', cncserver.settings.showcolortext ? "" : set.colors[i]);
    }
    setTimeout(cacheColors, 500);
  }

  function cacheColors() {
    // Cache the current colorset config for measuring against as HSL
    cncserver.config.colors = [];
    cncserver.config.colorsYUV = [];

    // Check to see if CSS is loaded...
    var colorTest = $('#color0').css('background-color');
    if (colorTest == "transparent" || colorTest == "rgba(0, 0, 0, 0)") {
      setTimeout(cacheColors, 500);
      console.info('css still loading...');
      return;
    }

    $('a.color').each(function(){
      cncserver.config.colors.push(
        cncserver.utils.colorStringToArray($(this).css('background-color'))
      );
    });
    // Also add white paper for near-white color detection
    cncserver.config.colors.push([255,255,255]);

    // Add cached YUV conversions for visual color matching
    $.each(cncserver.config.colors, function(i, color){
      cncserver.config.colorsYUV.push(cncserver.utils.rgbToYUV(color));
    });
  }

  cncserver.canvas.loadSVG = loadSVG; // Externalize this function
  function loadSVG(file) {
    // If we've been given a filename, go load it in then try again
    if (typeof file == 'string') {
      $.ajax({
        url: 'svgs/' + file,
        dataType: 'text',
        success: function(data){
          localStorage["svgedit-default"] = data;
          loadSVG();
        }
      });
      return;
    }

    // Load default content from SVG-edit
    if (localStorage["svgedit-default"]){
      $('svg#main g#cncserversvg').empty();
      $('svg#main g#cncserversvg').append(localStorage["svgedit-default"]);

      // Convert anything not a path into a path for proper tracing
      cncserver.utils.changeToPaths('svg#main g#cncserversvg');
    }

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
        cncserver.utils.addShortcuts($path);
        $path.addClass('selected');
        cncserver.path = $path;
      }

      // Enable/disable buttons if selected/not
      $('#draw').prop('disabled', !selected);
      $('#fill').prop('disabled', !selected);

      e.stopPropagation(); // Don't bubble up and select groups
    });
  }

  function bindControls() {
    // Ensure buttons are disabled as we have no selection
    $('#draw').prop('disabled', true);
    $('#fill').prop('disabled', true);

    // Pause management
    var pauseText = 'Click to stop current operations';
    var resumeText = 'Click to resume operations';
    var pausePenState = 0;
    $('#pause').click(function(){

      if (!cncserver.state.process.paused) {
        // Only attempt to status pause if something is going on, but always allow pause
        if (cncserver.state.buffer.length) {
          cncserver.utils.status('Pausing current process...');
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

        $('#pause').removeClass('active').attr('title', pauseText).text('STOP');
        if (cncserver.state.buffer.length) {
          cncserver.utils.status('Drawing resumed...', true);
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
        cncserver.utils.status('Paused. Click resume to continue.', 'complete');
        $('#pause').addClass('active').attr('title', resumeText).text('Resume');
      }
    }

    // Bind sim view click
    $('#showsim, #sim').click(function(e) {
      if ($('#sim:visible').length) {
        $('#sim').hide();
      } else {
        cncserver.utils.simulateBuffer();
      }
    });

    // Bind to control buttons
    $('#park').click(function(){
      cncserver.utils.status('Parking brush...');
      cncserver.api.pen.park(function(d){
        cncserver.utils.status(['Brush parked succesfully', "Can't Park, already parked"], d);
      });
    });

    $('#draw').click(function(){
      $('#draw').prop('disabled', true);
      cncserver.cmd.run([['status', 'Painting along selected path...']]);
      cncserver.paths.runOutline($path, function(){
        if ($('#parkafter').is(':checked')) cncserver.cmd.run('park');
        $('#draw').prop('disabled', false);
        cncserver.cmd.run([['status', 'Painting complete', true]]);
      });
    });

    $('#pen').click(function(){
      if (cncserver.state.pen.state) {
        cncserver.api.pen.up(function(){
          $('#pen').removeClass('up').addClass('down').text('Lower Brush');
        });
      } else {
        cncserver.api.pen.down(function(){
          $('#pen').removeClass('down').addClass('up').text('Raise Brush');
        });
      }
    });

    $('#calibrate').click(function(){
      cncserver.api.pen.move({x: 0, y:0});
    });

    $('#disable').click(function(){
      cncserver.utils.status('Unlocking motors...');
      cncserver.api.motors.unlock(function(d){
        cncserver.utils.status(['Motors unlocked! Will re-lock at next move'], d);
      });
    });
    $('#zero').click(function(){
      cncserver.utils.status('Absolute position reset', true);
      cncserver.api.pen.zero();
    });

    $('#auto-paint').click(function(){
      // Momentarily hide selection
      if ($path.length) $path.toggleClass('selected');

      $('#auto-paint, #fill, #draw').prop('disabled', true);
      cncserver.wcb.autoPaint($('#cncserversvg'), function(){
        $('#auto-paint, #fill, #draw').prop('disabled', false);
      });

    });

    $('#auto-color').click(function(){
      // Momentarily hide selection
      if ($path.length) $path.toggleClass('selected');

      $(this).toggleClass('undo');
      cncserver.wcb.autoColor($('#cncserversvg'), !$(this).is('.undo'));

      // Bring back selection
      if ($path.length) $path.toggleClass('selected');

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

    // Bind to Tool Change nav items
    $('nav#tools a').click(function(e){

      if ($(this).is('.color')) {
        $('nav#tools a.selected').removeClass('selected');
        $(this).addClass('selected');
      }

      // X clicked: Do a full brush wash
      if ($(this).is('#colorx')) {
        cncserver.wcb.fullWash();
        $('nav#tools a.selected').removeClass('selected');
        return false;
      }

      // Standard tool change...
      var stuff = cncserver.utils.getMediaName(this.id).toLowerCase();
      cncserver.utils.status('Putting some ' + stuff + ' on the brush...')
      cncserver.api.tools.change(this.id, function(d){
        cncserver.utils.status(['There is now ' + stuff + ' on the brush'], d);
        cncserver.api.pen.resetCounter();
      });

      return false;
    });
  }

  function responsiveResize(){
    var w = $(window).width();
    var h = $(window).height();

    // These value should be static, set originally from central canvas config
    var mainOffset = {
      top: 20,
      left: 0
    };

    var toolScale = 1.3;
    var toolRightMargin = 40;
    var $tools = $('#tools');
    var controlLeftMargin = 60;

    // Scale tools to height match full size canvas
    $tools.css('-webkit-transform', 'scale(' + toolScale + ')');
    var toolWidth = $tools.width() * toolScale;

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
    cncserver.canvas.offset.left = (toolWidth + toolRightMargin - 1) * cncserver.canvas.scale;
    cncserver.canvas.offset.top = mainOffset.top + (22 * cncserver.canvas.scale);
  }

});

// Triggered on before close or switch mode, call callback to complete operation
function onClose(callback, isGlobal) {
  if (cncserver.state.buffer.length) {
    var r = confirm("Are you sure you want to go?\n\
Exiting print mode while printing will cancel all your jobs. Click OK to leave.");
    if (r == true) {
      callback(); // Close/continue
    }
  } else {
    callback(); // Close/continue
  }
}
