/**
 * @file Robopaint->Mode->Paper.JS include module. Manages the paper canvas
 *  resize and margin basics, along with initializing the layering required for
 *  other modes. Assumes access to robopaint object & canvas, mode.run, jQuery.
 *
 *  This paper module work a little differently than the others as it combines
 *  mode required code, and Paper.JS code together, and has different
 *  initialization instructions:
 *
 *  1. require this rp_module into a variable: canvas = rpRequire('canvas');
 *  2. Initialize the DOM Components and global settings via canvas on
 *     pageInitReady. See example mode, print and others for full example.
 *  3. Initialize in your custom PaperScript file: canvas.paperInit(paper);
 *  4. You should now have a paper.canvas namespace. Place canvas.onFrame(event)
 *     in your PaperScript onFrame callback, and you'll get animation of
 *     drawPoint. To move the drawPoint, we suggest attaching it like this:
 *
 *      mode.onPenUpdate = function(botPen){
 *        paper.canvas.drawPoint.move(botPen.absCoord, botPen.lastDuration);
 *      };
 *
 *
 * paper.canvas Provides: ======================================================
 *  settings {Object}: Contains all settings currently in use and from domInit. Margin
 *    and other settings can be changed directly here to effect canvas. Other
 *    modules may use this, or other settings within.
 *  mainLayer {Layer}: Holds SVG data, intended to be untouched art source data
 *  tempLayer {Layer}: Holds any temporary copy paths, easy to empty.
 *  actionLayer {Layer}: Holds any final motion paths
 *  overlayLayer {Layer}: Holds any non-drawing elements meant too be on top.
 *  loadSVG(svgData): Clears all layers and loads into the mainLayer all the
 *    paths contained within the SVG data.
 *  drawPoint {Group}: Just use drawPoint.move as shown above.
 */
"use strict";

var settings = {};
var $ = window.$;
var _ = require('underscore');
var paperLoaded = false;

module.exports = {
  // Initialize the paper canvas and elements
  domInit: function(s) {
    settings = module.exports.settings = s;

    // Create shortcuts and DOM elements
    settings.$shadow = $('<div>').attr('id', 'paper-shadow');
    settings.$canvas = $('<canvas>').attr({
      id: 'paper-main',
      'data-paper-keepalive': true,
      'data-paper-resize': true
    });
    settings.$back = $('<div>').attr('id', 'paper-back').append(
      settings.$canvas
    );

    // Add the stylesheet for the feature.
    $('<link>').attr({
      href: robopaint.appPath + "resources/styles/paper.canvas.css",
      rel: "stylesheet"
    }).appendTo('head');

    // Nest the DOM element as required
    settings.$canvas.container = $('<div>').attr('id', 'paper-canvas-container').append(
      settings.$back,
      settings.$shadow
    );

    // Insert elements on top of configured replacement element.
    $(settings.replace).replaceWith(settings.$canvas.container);

    // Bind the resize function to the window resize event if the mode isn't.
    if (settings.modeHandleResize !== true) {
      $(window).on('resize', module.exports.resize).resize();
    }
  },


  // Dynamically resize the canvas and it's associated elements based on the
  // given window size and configured margin. Centers within area and guarantees
  // visibility at all times and resolutions.
  resize: function() {
    var m = settings.wrapperMargin; // Absolute window margins
    var dm = robopaint.canvas.margin; // Relative/scaled print area margins
    var c = robopaint.canvas;
    var $s = settings.$shadow;
    var $p = settings.$back;
    var scale = 1;

    // Position the main container
    settings.$canvas.container.css(m);

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
      y: win.h / total.h
    };

    // Use the smallest
    scale = (scale.x < scale.y ? scale.x : scale.y);

    settings.scale = scale;

    // Set the size of the canvas to be only the size without margin
    settings.$canvas.width(c.width * scale);
    settings.$canvas.height(c.height * scale);

    // Paper size (matches shadow element), adding margins
    $s.add($p).width(total.w * scale);
    $s.add($p).height(total.h * scale);

    // Adjust position of canvas inside paper
    settings.$canvas.css({
      top: dm.top * scale,
      left: dm.left * scale
    });

    module.exports.paperLoad();

    // Paper specific resize code
    if (settings.paper) {
      settings.paper.view.zoom = settings.scale;
      var corner = settings.paper.view.viewToProject(new settings.paper.Point(0,0));
      settings.paper.view.scrollBy(new settings.paper.Point(0,0).subtract(corner));
    }
  },

  // Load the actual paper PaperScript (only when the canvas is ready).
  paperLoad: function() {
    if (!paperLoaded) {
      paperLoaded = true;
      if (!paper.utils) rpRequire('paper_utils')(paper);
      paper.utils.loadDOM(settings.paperScriptFile, "paper-main");
    }
  },

  paperInit: function(paper) {
    // Emulate PaperScript "Globals" as needed
    settings.paper = paper;
    var Point = paper.Point;
    var Path = paper.Path;
    var Group = paper.Group;
    var Layer = paper.Layer;
    var project = paper.project;

    if (!paper.utils) rpRequire('paper_utils')(paper);

    // Namespace all accessible parts under paper.canvas
    paper.canvas = {};

    // Setup default layers
    paper.utils.setupLayers();

    // Overlay layer is ready, add the drawpoint
    var drawPoint = paper.canvas.drawPoint = new Group({
      children: [
        new Path.Circle({
          center: [0, 0],
          radius: 15,
          strokeColor: 'red',
          strokeWidth: 10,
        }),
        new Path.Circle({
          center: [0, 0],
          radius: 10,
          strokeColor: 'white',
          strokeWidth: 5,
        }),
        new Path({
          segments:[[0, -20], [0, 20]],
          strokeWidth: 3,
          strokeColor: 'black'
        }),
        new Path({
          segments:[[-20, 0], [20, 0]],
          strokeWidth: 3,
          strokeColor: 'black'
        })
      ]
    });

    drawPoint.move = function(pos, duration) {
      pos = new Point(pos.x, pos.y);
      var vector = pos.subtract(drawPoint.position);
      if (vector.length) {
        var d = drawPoint.data;
        // If we're already moving, just hurry up and get straight to the dest
        if (d.moving === 2) {
          drawPoint.position = d.dest;
        }

        // Moves through stages: 0 is off, 1 is anim frame init, 2 is moving
        d.moving = 1;
        d.vector = vector;
        d.src = drawPoint.position;
        d.dest = pos;
        d.duration = (duration-40) / 1000; // Passed in MS, needed in S
      }
    };

    // Animate moving the drawPoint, to be run during PaperScript onFrame.
    drawPoint.animate = function(event) {
      var d = drawPoint.data;
      if (!d.moving) return; // Not moving

      if (d.moving === 1) { // Setup anim end time
        d.endTime = event.time + d.duration;
        d.moving = 2;
        return;
      }

      if (d.moving === 2){ // Actual animated movement based on delta.
        if (event.time > d.endTime) { // Movement is done
          d.moving = 0;
          drawPoint.position = d.dest;
        } else {
          var timeDiff = d.duration - (d.endTime - event.time);
          drawPoint.position = d.src.add(d.vector.divide(d.duration / timeDiff));
        }
      }
    }

    // SVG data loading!
    paper.canvas.loadSVG = function(svgData) {
      paper.canvas.mainLayer.removeChildren();
      paper.canvas.tempLayer.removeChildren();
      paper.canvas.actionLayer.removeChildren();-

      paper.canvas.mainLayer.activate();
      project.importSVG(svgData, {
        applyMatrix: true,
        expandShapes: true
      });

      // SVG Imports as a group, ungroup it.
      if (paper.canvas.mainLayer.children.length) {
        var group = paper.canvas.mainLayer.children[0];

        group.parent.addChildren(group.removeChildren());
        group.remove();
      }
    }

    // Paper init is done, call the DOM loadedCallback
    if (_.isFunction(settings.loadedCallback)) {
      settings.loadedCallback();
    }
  },

  // Intended to be called during the paper onFrame, handles any animation
  onFrame: function(event) {
    settings.paper.canvas.drawPoint.animate(event);
  }
};
