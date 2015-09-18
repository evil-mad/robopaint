/**
 * @file Holds all RoboPaint example mode text renderer initialization code.
 *   @see the mode readme for all the goodies that modes come with. Also,
 *      any robopaint dependencies you add to the package JSON will be available
 *      as well, like jQuery $ and underscore _.
 */
"use strict";

var actualPen = {}; // Hold onto the latest actualPen object from updates.
var buffer = {};
var canvas = rpRequire('canvas');
var hershey = require('hersheytext');
var textHasRendered = false; // First run boolean

mode.pageInitReady = function () {
  // Initialize the paper.js canvas with wrapper margin and other settings.
  canvas.domInit({
    replace: '#paper-placeholder', // jQuery selecter of element to replace
    paperScriptFile: 'example.ps.js', // The main PaperScript file to load
    wrapperMargin: {
      top: 30,
      left: 30,
      right: 265,
      bottom: 40
    },

    // Called when PaperScript init is complete, requires
    // canvas.paperInit(paper) to be called in this modes paperscript file.
    // Don't forget that!
    loadedCallback: paperLoadedInit
  });
}

// Callback that tells us that our Paper.js canvas is ready!
function paperLoadedInit() {
  console.log('Paper ready!');

  // Set center adjusters based on size of canvas
  $('#hcenter').attr({
    value: 0,
    min: -(robopaint.canvas.width / 2),
    max: robopaint.canvas.width / 2
  });

  $('#vcenter').attr({
    value: 0,
    min: -(robopaint.canvas.height / 2),
    max: robopaint.canvas.height / 2
  });

  $(window).resize();

  // Use mode settings management on all "managed" class items. This
  // saves/loads settings from/into the elements on change/init.
  mode.settings.$manage('.managed');

  // With Paper ready, send a single up to fill values for buffer & pen.
  mode.run('up');
}

// Bind all controls (happens before pageInitReady, @see mode.preload.js)
mode.bindControls = function() {
  // Populate font choices
  _.each(hershey.fonts, function(font, id){
    $('<option>').text(font.name).val(id).appendTo('#fontselect');
  });

  // Bind trigger for font selection
  $('#fontselect').change(function(){
    textHasRendered = true;

    // Render some text into the SVG area with it
    paper.renderText($('#fonttext').val(), {
      layer: paper.canvas.actionLayer,
      font: $(this).val(),
      pos: {x: 0, y: 0},
      scale: parseInt($('#scale').val()) / 100,
      spaceWidth: parseInt($('#spacewidth').val()),
      charSpacing: parseFloat($('#charspacing').val() / 4),
      wrapWidth: parseInt($('#wrap').val()),
      lineHeight:parseFloat($('#lineheight').val() / 4),
      hCenter: parseInt($('#hcenter').val()),
      vCenter: parseInt($('#vcenter').val()),
      textAlign: $('#textalign input:checked').val()
    });
  }).val('futural'); // Set default font

  // Re-render on keypress/change
  $('input').on('input change', function(e){
    $('#fontselect').change();
  });

  // Bind save functionality
  $('#save').click(function() {
    robopaint.svg.save(
      robopaint.svg.wrap(paper.canvas.actionLayer.exportSVG({asString: true}))
    );
  });

  // Bind print functionality
  $('#print').click(function() {
    // Auto Paint requires everything on the layer be ungrouped, so we ungroup
    // everything first, then autoPaint.
    paper.utils.ungroupAllGroups(paper.canvas.actionLayer);
    paper.utils.autoPaint(paper.canvas.actionLayer);

    // The ungrouped elements aren't terribly useful, so we can just delete them
    // then re-render them by triggering a fontselect change.
    paper.canvas.actionLayer.removeChildren();
    $('#fontselect').change();
  });
}

// Actual pen update event
mode.onPenUpdate = function(botPen){
  paper.canvas.drawPoint.move(botPen.absCoord, botPen.lastDuration);
  actualPen = $.extend({}, botPen);

  // Update button text/state
  // TODO: change implement type <brush> based on actual implement selected!
  /*var key = 'common.action.brush.raise';
  if (actualPen.state === "up" || actualPen.state === 0){
    key = 'common.action.brush.lower';
  }
  $('#pen').text(t(key));*/
}

// An abbreviated buffer update event, contains paused/not paused & length.
mode.onBufferUpdate = function(b) {
  buffer = b;
}
