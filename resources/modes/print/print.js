/**
 * @file Holds all RoboPaint automatic painting mode specific code
 */

robopaintRequire(['jquery.svg', 'jquery.svgdom', 'svgshared', 'wcb', 'commander', 'paths'],
function($, robopaint, cncserver) {

  /**
   * Update the colorset shortcut! (don't need to render as auto doesn't display
   * the colorset rendering)
   *
   * This is "outside of the main "global" so robopaint's main.js knows where to
   * find it. Same format for robopaint.method-draw.js
   */
  window.updateColorSet = function (){
    cncserver.config.colors = robopaint.statedata.colorsets[robopaint.settings.colorset].colors;
  }


$(function() {
  var $svg = $('svg#main');

  // Pause/resume buffer text
  // TODO: Translate these!
  var bufferStateText = {
    ready: 'Click to start painting your picture!',
    pause: 'Click to stop current operations',
    resume: 'Click to resume operations',
    wait: 'Please wait while executed processes complete...'
  }


  // Handle buffer triggered callbacks
  robopaint.socket.on('callback update', function(callback){
    switch(callback.name) {
      case 'autopaintcomplete': // Should happen when we're completely done
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

  // Callback for when SVG loading is complete
  cncserver.canvas.loadSVGCallback = function(){
    // If there's an remote print external callback waiting, trigger it =======
    // ========================================================================
    if (typeof robopaint.api.print.loadCallback === "function") {
      robopaint.api.print.loadCallback({
        status: 'success',
        pathCount: $('#cncserversvg path').length,
        context: document // Pass along document context so we can cross over from parent
      });
    }
  }

  // Externally accessible bind controlls trigger for robopaint.mode.svg to call
  window.bindControls = function() {

    // Cancel Print
    $('#cancel').click(function(){
      var cancelPrint = confirm("Are you sure you want to cancel the current print job and reset (for example, to start a new print job)?");
      if (cancelPrint) {
        unBindEvents(function(){
          robopaint.switchMode('home', function(){
            robopaint.switchMode('print');
          });
        });
      }
    });


    // Bind pause click and functionality
    $('#pause').click(function() {

      // With nothing in the queue, start autopaint!
      if (cncserver.state.buffer.length === 0) {
        $('#pause').removeClass('ready').attr('title', bufferStateText.pause).text('Pause');
        $('#buttons button.normal').prop('disabled', true); // Disable options
        $('#cancel').prop('disabled', false); // Enable the cancel print button

        cncserver.wcb.autoPaint($('#cncserversvg'),
          function(){ // Finished spooling callback
            if (cncserver.config.canvasDebug) {
              $('canvas#debug').show();
            }
          }
        );
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

    cncserver.canvas.loadSVG(); // Load the default SVG after controls are bound
  }

  function responsiveResize(){
    var w = $(window).width();
    var h = $(window).height();

    // These value should be static, set originally from central canvas config
    var mainOffset = {
      top: 30,
      left: 20,
      bottom: 30,
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
