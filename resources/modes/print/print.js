/**
 * @file Holds all RoboPaint automatic painting mode specific code
 */
"use strict";

var actualPen = {}; // Hold onto the latest actualPen object from updates.
var buffer = {};
var t = i18n.t; // The mother of all shortcuts
var $canvas;

// The limit that the canvas wrapper can move to in the window
var wrapperMargin = {
  top: 30,
  left: 30,
  right: 265,
  bottom: 40
};

mode.pageInitReady = function () {
  $canvas = $('canvas#main');
  $canvas.container = $('#canvas-container');

  $(window).on('resize', responsiveResize).resize();
}

function responsiveResize() {
  var m = wrapperMargin; // Absolute window margins
  var dm = robopaint.canvas.margin; // Relative/scaled paper margins
  var c = robopaint.canvas;
  var $s = $('#shadow');
  var $p = $('#paper-back');
  var scale = 1;

  // Position the main container
  $canvas.container.css(m);

  // Window Size (less the appropriate absolute margins)
  var win = {
    w: $(window).width() - (m.left + m.right),
    h: $(window).height() - (m.top + m.bottom),
  };

  // canvas plus margins
  var total = {
    w: c.width + dm.width,
    h: c.height + dm.height
  };

  // How much of the total size can fit in the area?
  var scale = {
    x: win.w / total.w,
    y: win.h / total.h,
  };

  // Use the smallest
  scale = (scale.x < scale.y ? scale.x : scale.y);

  $canvas.scale = scale;

  // Set the size of the canvas to be only the size without margin
  $canvas.width(c.width * scale);
  $canvas.height(c.height * scale);

  // Paper size (matches shadow element), adding margins
  $s.add($p).width(total.w * scale);
  $s.add($p).height(total.h * scale);

  // Adjust position of canvas inside paper
  $canvas.css({
    top: dm.top * scale,
    left: dm.left * scale
  });


  paperLoad();
}

// Load the actual paper PaperScript (only when the canvas is ready).
var paperLoaded = false;
function paperLoad() {
  if (!paperLoaded) {
    paperLoaded = true;
    $canvas.attr('resize', true);
    paper.PaperScript.load($('<script>').attr({
      type:"text/paperscript",
      src: "print.ps.js",
      canvas: "main"
    })[0]);
  }
}

// Trigger load init resize only after paper has called this function.
function paperLoadedInit() {
  $(window).resize();
  if (localStorage['svgedit-default']) {
    paper.loadSVG(localStorage['svgedit-default']);
  }

  // With Paper ready, send a single up to fill values for buffer & pen.
  mode.run('up');
}


// Catch CNCServer buffered callbacks
mode.onCallbackEvent = function(name) {
  switch (name) {
    case 'autoPaintComplete': // Should happen when we're completely done
      $('#pause').attr('class', 'ready')
        .attr('title', t('modes.print.status.ready'))
        .text(robopaint.t('common.action.start'));
      $('#buttons button.normal').prop('disabled', false); // Enable options
      $('#cancel').prop('disabled', true); // Disable the cancel print button
      break;
  }
};

// Catch less general message types
mode.onMessage = function(channel, data) {
  switch (channel) {
    // SVG has been pushed into localStorage, and main suggests you load it.
    case 'loadSVG':
      paper.resetAll();
      mode.run('status', '')
      paper.loadSVG(localStorage['svgedit-default']);
      break;
  }
};

// Mode API called callback for binding the controls
mode.bindControls = function(){
  // Cancel Print
  $('#cancel').click(function(){
    var cancelPrint = confirm(t("modes.print.status.confirm"));
    if (cancelPrint) {
      paper.resetAll(); // Cleanup paper portions
      mode.onCallbackEvent('autoPaintComplete');
      mode.run([
        ['park'],
        ['status', i18n.t('modes.print.status.cancelled'), true],
        ['progress', 0, 1],
        ['clear'],
        ['localclear']
        // As a nice reminder, localclear MUST be last, otherwise the commands
        // after it will be cleared before being sent :P
      ], true); // As this is a forceful cancel, shove to the front of the queue
    }
  });


  // Bind pause click and functionality
  $('#pause').click(function() {

    // With nothing in the queue, start autopaint!
    if (buffer.length === 0) {
      $('#pause')
        .removeClass('ready')
        .attr('title', t("modes.print.status.pause"))
        .text(t('common.action.pause'));
      $('#buttons button.normal').prop('disabled', true); // Disable options
      $('#cancel').prop('disabled', false); // Enable the cancel print button

      /*
      cncserver.wcb.autoPaint($('#cncserversvg'),

      );*/

      paper.renderMotionPaths(); // Render motion to the action layer

      // When done, lets autoPaint em!
      paper.renderMotionComplete = function(){
        paper.autoPaint(paper.actionLayer);
      }

    } else {
      // With something in the queue... we're either pausing, or resuming
      if (!buffer.paused) {
        // Starting Pause =========
        $('#pause').prop('disabled', true).attr('title', t("status.wait"));
        mode.run([
          ['status', t("status.pausing")],
          ['pause']
        ], true); // Insert at the start of the buffer so it happens immediately

        mode.onFullyPaused = function(){
          mode.run('status', t("status.paused"));
          $('#buttons button.normal').prop('disabled', false); // Enable options
          $('#pause')
            .addClass('active')
            .attr('title', t("status.resume"))
            .prop('disabled', false)
            .text(t("common.action.resume"));
        };
      } else {
        // Resuming ===============
        $('#buttons button.normal').prop('disabled', true); // Disable options
        mode.run([
          ['status', t("status.resuming")],
          ['resume']
        ], true); // Insert at the start of the buffer so it happens immediately

        mode.onFullyResumed = function(){
          $('#pause')
            .removeClass('active')
            .attr('title', t("mode.print.status.pause"))
            .text(t('common.action.pause'));
          mode.run('status', t("status.resumed"));
        };
      }
    }
  });

  // Bind to control buttons
  $('#park').click(function(){
    // If we're paused, skip the buffer
    mode.run([
      ['status', t("status.parking"), buffer.paused],
      ['park', buffer.paused], // TODO: If paused, only one message will show :/
      ['status', t("status.parked"), buffer.paused]
    ]);
  });


  $('#pen').click(function(){
    // Run height pos into the buffer, or skip buffer if paused
    var newState = 'up';
    if (actualPen.state === "up" || actualPen.state === 0) {
      newState = 'down';
    }

    mode.run(newState, buffer.paused);
  });

  // Motor unlock: Also lifts pen and zeros out.
  $('#disable').click(function(){
    mode.run([
      ['status', t("status.unlocking")],
      ['up'],
      ['zero'],
      ['unlock'],
      ['status', t("status.unlocked")]
    ]);
  });
}

// Warn the user on close about cancelling jobs.
mode.onClose = function(callback) {
  if (buffer.length) {
    var r = confirm(t('modes.print.dialog.confirmexit'));
    if (r == true) {
      run([
        ['clear'],
        ['park'],
        ['clearlocal']
      ]);
      callback(); // The user chose to close.
    }
  } else {
    callback(); // Close, as we have nothing the user is waiting on.
  }
}

// Actual pen update event
mode.onPenUpdate = function(botPen){
  paper.moveDrawPoint(botPen.absCoord, botPen.lastDuration);
  actualPen = $.extend({}, botPen);

  // Update button text/state
  // TODO: change implement type <brush> based on actual implement selected!
  var key = 'common.action.brush.raise';
  if (actualPen.state === "up" || actualPen.state === 0){
    key = 'common.action.brush.lower';
  }
  $('#pen').text(t(key));
}

// An abbreviated buffer update event, contains paused/not paused & length.
mode.onBufferUpdate = function(b) {
  buffer = b;
}
