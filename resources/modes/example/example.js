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
  var run = cncserver.cmd.run; // Handy shortcut for run

  // Pause/resume buffer text
  // TODO: Translate these!
  var bufferStateText = {
    ready: 'Click to start painting',
    pause: 'Click to stop current operations',
    resume: 'Click to resume operations',
    wait: 'Please wait while executed processes complete...'
  }

  // Handle buffer triggered callbacks
  robopaint.socket.on('callback update', function(callback){
    switch(callback.name) {
      case 'drawcomplete': // Should happen when we're completely done
        run('park');
        cncserver.wcb.status('All done!');
        $('#pause').attr('class', 'ready').attr('title', bufferStateText.ready).text('Start');
        $('#buttons button.normal').prop('disabled', false); // Enable options
        $('#cancel').prop('disabled', true); // Disable the cancel print button
        break;
    }
  });

  // Fit the canvas and other controls to the screen size
  responsiveResize();
  setTimeout(responsiveResize, 500);
  $(window).resize(responsiveResize);

  // Populate font choices
  for (var id in cncserver.fonts) {
    $('<option>').text(cncserver.fonts[id].name).val(id).appendTo('#fontselect');
  }

  // Externally accessible bind controlls trigger for robopaint.mode.svg to call
  window.bindControls = function() {
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
    }).val('futural').change(); // Trigger initial run (and default font)

    // Re-render on keypress
    $('input').on('input', function(e){
      $('#fontselect').change();
    });

    // Cancel Print
    $('#cancel').click(function(){
      var cancelPrint = confirm("Are you sure you want to cancel the current print job?");
      if (cancelPrint) {
        cncserver.wcb.status('Cancelling...');
        run(['localclear', 'clear', 'resume', 'park', ['callbackname', 'drawcomplete']]);
      }
    });

    // Bind pause click and functionality
    $('#pause').click(function() {
      // With nothing in the queue, start painting the text
      if (cncserver.state.buffer.length == 0) {
        $('#pause').removeClass('ready').attr('title', bufferStateText.pause).text('Pause');
        $('#buttons button.normal').prop('disabled', true); // Disable options
        $('#cancel').prop('disabled', false); // Enable the cancel print button

        // Run all paths into run buffer for drawing
        //run(['wash', ['tool', 'color1']]);
        $('#textexample path').each(function(){
          run('status', 'Drawing character "' + $(this).attr('letter') + '"');
          cncserver.paths.runOutline($(this));
        });

        // Run the "drawcomplete" callback when finished
        run('callbackname', 'drawcomplete');

      } else {
        // With something in the queue... we're either pausing, or resuming
        if (!cncserver.state.process.paused) {
          // Starting Pause =========
          $('#pause').prop('disabled', true).attr('title', bufferStateText.wait);
          cncserver.wcb.status('Pausing current process...');

          robopaint.cncserver.api.buffer.pause(function(){
            cncserver.wcb.status('Paused. Click resume to continue.', 'complete');
            $('#buttons button.normal').prop('disabled', false); // Enable options
            $('#pause').addClass('active').attr('title', bufferStateText.resume).text('Resume');
            $('#pause').prop('disabled', false);
          });
        } else {
          // Resuming ===============
          $('#buttons button.normal').prop('disabled', true); // Disable options
          cncserver.wcb.status('Resuming current process...');
          robopaint.cncserver.api.buffer.resume(function(){
            $('#pause').removeClass('active').attr('title', bufferStateText.pause).text('Pause');
            cncserver.wcb.status('Drawing resumed...', true);
          });
        }
      }
    });

    // Bind to control buttons
    $('#park').click(function(){
      cncserver.wcb.status('Parking brush...');
      robopaint.cncserver.api.pen.park(function(d){
        cncserver.wcb.status(['Brush parked succesfully', "Can't Park, already parked"], d);
      }, {skipBuffer: cncserver.state.process.paused ? 1 : ''});
    });

    // Pen/Brush up & down
    $('#pen').click(function(){
      robopaint.cncserver.api.pen.height($('#pen').is('.up') ? 0 : 1, null, {
        skipBuffer: cncserver.state.process.paused ? 1 : ''
      });
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
  }

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
