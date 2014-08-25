/**
 * @file Holds all RoboPaint example mode text renderer initialization code
 */

robopaintRequire(['hersheytext', 'svgshared', 'wcb', 'commander', 'paths'],
function($, robopaint, cncserver) {

  // We don't ever check visibility/overlap for this mode because the
  // text output is fully linear and only lines
  cncserver.config.checkVisibility = false;

// On page load complete...
$(function() {
  parent.fadeInWindow(); // Actually show the mode window

  $('#drawpoint').hide(); // Hide the drawpoint

  // Fit the canvas and other controls to the screen size
  responsiveResize();
  setTimeout(responsiveResize, 500);
  $(window).resize(responsiveResize);

  // Populate font choices
  for (var id in cncserver.fonts) {
    $('<option>').text(cncserver.fonts[id].name).val(id).appendTo('#fontselect');
  }

  // Bind trigger for font selection
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
      target: '#target',
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
    var cancelPrint = confirm("Are you sure you want to cancel the current print job?");
    if (cancelPrint) {
      window.unBindEvents(function(){
        robopaint.switchMode('home', function(){
          robopaint.switchMode('example');
        });
      });
    }
  });

  // Pause management
  var stateText = {
    ready: 'Click to start painting',
    pause: 'Click to stop current operations',
    resume: 'Click to resume operations',
    wait: 'Please wait while executed processes complete...'
  }

  var pausePenState = 0;
  $('#pause').click(function(){

    // With nothing in the queue, start painting the text
    if (cncserver.state.buffer.length == 0) {
      $('#pause').removeClass('ready').attr('title', stateText.pause).text('Pause');
      $('#buttons button.normal').prop('disabled', true); // Disable options
      $('#cancel').prop('disabled', false); // Enable the cancel print button

      // Run all paths into run buffer for drawing
      var run = cncserver.cmd.run;
      //run(['wash', ['tool', 'color1']]);
      $('#textexample path').each(function(){
        run('status', 'Drawing letter "' + $(this).attr('letter') + '"');
        cncserver.paths.runOutline($(this));
      });

      // Add custom callback to buffer once everythign else is done
      run('custom', function(){
        run([['park'], ['status', 'All done!']]);
        $('#pause').attr('class', 'ready').attr('title', stateText.ready).text('Start');
        $('#buttons button.normal').prop('disabled', false); // Enable options
        $('#cancel').prop('disabled', true); // Disable the cancel print button
      });

    } else {
      // With something in the queue... we're either pausing, or resuming
      if (!cncserver.state.process.paused) {
        // Starting Pause =========
        $('#pause').prop('disabled', true).attr('title', stateText.wait);
        cncserver.wcb.status('Pausing current process...');
        cncserver.state.process.paused = true;
      } else {
        // Resuming ===============
        cncserver.state.process.paused = false;

        $('#buttons button.normal').prop('disabled', true); // Disable options

        // Execute next should put us where we need to be
        cncserver.cmd.executeNext(function(){
          // If the pen was down before, put it down now after the resuming command.
          if (pausePenState) {
            cncserver.state.buffer.push('down'); // Add to END of queue
          }
        });

        $('#pause').removeClass('active').attr('title', stateText.pause).text('Pause');
        cncserver.wcb.status('Drawing resumed...', true);
        pausePenState = 0;
      }
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
      $('#buttons button.normal').prop('disabled', false); // Enable options
      $('#pause').addClass('active').attr('title', stateText.resume).text('Resume');
      $('#pause').prop('disabled', false);
    }
  }


  // Bind to control buttons
  $('#park').click(function(){
    cncserver.wcb.status('Parking brush...');
    robopaint.cncserver.api.pen.park(function(d){
      cncserver.wcb.status(['Brush parked succesfully', "Can't Park, already parked"], d);
    });
  });

  // Pen/Brush up & down
  $('#pen').click(function(){
    robopaint.cncserver.api.pen.height($('#pen').is('.up') ? 0 : 1);
  });

  // Motor unlock: Also lifts pen and zeros out.
  $('#disable').click(function(){
    cncserver.wcb.status('Unlocking motors...');
    robopaint.cncserver.api.pen.up();
    robopaint.cncserver.api.pen.zero();
    robopaint.cncserver.api.motors.unlock(function(d){
      cncserver.wcb.status(['Motors unlocked! Place in home corner when done'], d);
    });
  });

  // Move the visible draw position indicator
  robopaint.$(robopaint.cncserver.api).bind('movePoint', function(e, p) {
    // Move visible drawpoint
    var $d = $('#drawpoint');

    $d.show().attr('fill', cncserver.state.pen.state ? '#FF0000' : '#00FF00');

    // Add 48 to each side for 1/2in offset
    p = cncserver.wcb.getAbsCoord(p);
    $d.attr('transform', 'translate(' + (p.x - 48) + ',' + (p.y - 48) + ')');
  });

  robopaint.$(robopaint.cncserver.api).bind('offCanvas', function() {
    $('#drawpoint').hide();
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

}); // End Page load complete

}); // End RequireJS init
