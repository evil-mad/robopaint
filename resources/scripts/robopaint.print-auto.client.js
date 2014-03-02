/**
 * @file Holds all RoboPaint automatic painting mode specific code
 */

$(function() {
  var $svg = $('svg#main');

  bindControls(); // Bind all clickable controls

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

  cncserver.canvas.loadSVG(); // Load the default SVG


  function bindControls() {

    // Cancel Print
    $('#cancel').click(function(){
      var cancelPrint = confirm("Are you sure you want to cancel the current print job and reset (for example, to start a new print job)?");
      if (cancelPrint) {
        robopaint.cncserver.api.buffer.clear(function(){
          cncserver.state.buffer = [];
          robopaint.cncserver.api.pen.park();
          unBindEvents();
          robopaint.switchMode('home', function(){
            robopaint.switchMode('print');
          });
        });
      }
    });

    // Pause management
    var stateText = {
      ready: 'Click to start painting your picture!',
      pause: 'Click to stop current operations',
      resume: 'Click to resume operations',
      wait: 'Please wait while executed processes complete...'
    }

    var pausePenState = 0;
    $('#pause').click(function(){

      // With nothing in the queue, start autopaint!
      if (cncserver.state.buffer.length == 0) {
        $('#pause').removeClass('ready').attr('title', stateText.pause).text('Pause');
        $('#buttons button.normal').prop('disabled', true); // Disable options
        $('#cancel').prop('disabled', false); // Enable the cancel print button

        cncserver.wcb.autoPaint($('#cncserversvg'),
          function(){ // Finished spooling callback
            if (cncserver.config.canvasDebug) {
              $('canvas#debug').show();
            }
          }, function(){ // Actually Complete callback
            $('#pause').attr('class', 'ready').attr('title', stateText.ready).text('Start');
            $('#buttons button.normal').prop('disabled', false); // Enable options
            $('#cancel').prop('disabled', true); // Disable the cancel print button
          }
        );
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
      $d.attr('transform', 'translate(' + (p.x + 48) + ',' + (p.y + 48) + ')');
    });

    robopaint.$(robopaint.cncserver.api).bind('offCanvas', function() {
      $('#drawpoint').hide();
    });
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

    // TODO: Find out where these inconsistencies in size/position come from
    cncserver.canvas.offset.left = mainOffset.left+1;
    cncserver.canvas.offset.top = mainOffset.top+1;
  }

});

/**
 * Update the colorset shortcut! (don't need to render as auto doesn't display
 * the colorset rendering)
 *
 * This is "outside of the main "global" so robopaint's main.js knows where to
 * find it. Same format for robopaint.method-draw.js
 */
function updateColorSet(){
  cncserver.config.colors = robopaint.statedata.colorsets[robopaint.settings.colorset].colors;
}
