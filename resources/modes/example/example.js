/**
 * @file Holds all RoboPaint example mode initialization code
 */

robopaintRequire(['hersheytext', 'wcb', 'commander', 'paths'],
function($, robopaint, cncserver) {
  // Give cncserver semi-global scope so it can easily be checked outside the module
  window.cncserver = cncserver;

  // Set the "global" scope objects for any robopaint level details
  cncserver.canvas = {
    height: robopaint.canvas.height,
    width: robopaint.canvas.width,
    scale: 1,
    offset: {
      top: 20,
      left: 20
    }
  };

  cncserver.state = {
    pen: {},
    buffer: [], // Hold commands to be interpreted as free operations come
    media: '', // What we think is currently on the brush
    mediaTarget: '', // What we "want" to paint with
    process: {
      name: 'idle',
      waiting: false,
      busy: false,
      paused: false,
      max: 0
    }
  };

  // We don't ever check visibility/overlap for this mode
  cncserver.config = {
    checkVisibility: false
  };

// On page load complete...
$(function() {
  parent.fadeInWindow(); // Actually show the mode window

  var $svg = $('svg#main');

  $('#drawpoint').hide(); // Hide the drawpoint

  // Fit the canvas and other controls to the screen size
  responsiveResize();
  setTimeout(responsiveResize, 500);
  $(window).resize(responsiveResize);

  // Populate font choices
  for (var id in cncserver.fonts) {
    $('<option>').text(cncserver.fonts[id].name).val(id).appendTo('#fontselect');
  }

  $('#fontselect').change(function(){
    $('#textexample').remove(); // Kill the old one (if any)

    // Render some text into the SVG area with it
    cncserver.renderText($('#fonttext').val(), {
      font: cncserver.fonts[$(this).val()],
      pos: {x: 0, y: 0},
      scale: parseInt($('#scale').val()) / 100,
      charWidth: parseInt($('#charwidth').val()),
      wrapWidth: parseInt($('#wrap').val()),
      centerWidth: parseInt($('#hcenter').val()),
      centerHeight: parseInt($('#vcenter').val()),
      target: '#main',
      id: 'textexample'
    });

    // REQUIRED: Refresh DOM to reinstate node status with XML namespaces
    // TODO: There must be a better way to do this! :P
    $('#scale-container').html($('#scale-container').html());
  }).change(); // Trigger initial run

  // Re-render on keypress
  $('input').on('input', function(e){
    $('#fontselect').change();
  });

  // Cancel Print
  $('#cancel').click(function(){
    var cancelPrint = confirm("Are you sure you want to cancel the current print job and reset (for example, to start a new print job)?");
    if (cancelPrint) {
      unBindEvents(function(){
        robopaint.switchMode('home', function(){
          robopaint.switchMode('manual');
        });
      });
    }
  });

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
      robopaint.cncserver.api.pen.up(_pauseDone);
    } else {
      _pauseDone();
    }

    function _pauseDone() {
      cncserver.wcb.status('Paused. Click resume to continue.', 'complete');
      $('#pause').addClass('active').attr('title', resumeText).text('Resume');
    }
  }

  // Bind to control buttons
  $('#park').click(function(){
    // If we're paused, run it directly, otherwise add to buffer
    if (cncserver.state.process.paused) {
      cncserver.wcb.status('Parking brush...');
      robopaint.cncserver.api.pen.park(function(d){
        cncserver.wcb.status(['Brush parked succesfully', "Can't Park, already parked"], d);
      });
    } else {
      cncserver.cmd.run('park');
    }
  });

  $('#draw').click(function(){
    $('#draw').prop('disabled', true);
    cncserver.cmd.run([['status', 'Painting along selected path...']]);
    $path.removeClass('ants'); // Can't stroke with ants! Screws up visibility

    cncserver.paths.runOutline($path, function(){
      if ($('#parkafter').is(':checked')) cncserver.cmd.run('park');
      $('#draw').prop('disabled', false);
      $path.addClass('ants');
      cncserver.cmd.run([['status', 'Painting complete', true]]);

      if (cncserver.config.canvasDebug) {
        $('canvas#debug').show();
      }

    });
  });

  $('#pen').click(function(){
    robopaint.cncserver.api.pen.height($('#pen').is('.up') ? 0 : 1);
  });

  $('#calibrate').click(function(){
    robopaint.cncserver.api.pen.move(cncserver.wcb.getPercentCoord({x: 0, y:0}));
  });

  $('#disable').click(function(){
    cncserver.wcb.status('Unlocking motors...');
    robopaint.cncserver.api.pen.up();
    robopaint.cncserver.api.pen.zero();
    robopaint.cncserver.api.motors.unlock(function(d){
      cncserver.wcb.status(['Motors unlocked! Place in home corner when done'], d);
    });
  });

  $('#zero').click(function(){
    cncserver.wcb.status('Absolute position reset', true);
    robopaint.cncserver.api.pen.zero();
  });

  // Move the visible draw position indicator
  var $drawpoint = $('#drawpoint');
  robopaint.$(robopaint.cncserver.api).bind('movePoint', function(e, p) {
    // Move visible drawpoint
    $drawpoint.show().attr('fill', cncserver.state.pen.state ? '#FF0000' : '#00FF00');

    // Add 48 to each side for 1/2in offset
    p = cncserver.wcb.getAbsCoord(p);
    $drawpoint.attr('transform', 'translate(' + (p.x + 48) + ',' + (p.y + 48) + ')');
  });

  robopaint.$(robopaint.cncserver.api).bind('offCanvas', function() {
    $drawpoint.hide();
  });

  // Externalize for remote triggering
  window.responsiveResize = responsiveResize;
  function responsiveResize(){
     var w = $(window).width();
    var h = $(window).height();

    // These value should be static, set originally from central canvas config
    var mainOffset = {
      top: 30,
      left: 30,
      bottom: 40,
      right: $('#control').width() + 50
    };

    // Calculate scale for both width and height...
    var scale = {
      x: (w - (mainOffset.left + mainOffset.right)) / cncserver.canvas.width,
      y: (h - (mainOffset.top + mainOffset.bottom)) / cncserver.canvas.height
    }

    // ...use the smaller of the two
    cncserver.canvas.scale = scale.x < scale.y ? scale.x : scale.y;

    $('#scale-container') // Actually do the scaling
      .css('-webkit-transform', 'scale(' + cncserver.canvas.scale + ')');

    cncserver.canvas.offset.left = mainOffset.left+1;
    cncserver.canvas.offset.top = mainOffset.top+1;
  }

});

}); // End RequireJS init
