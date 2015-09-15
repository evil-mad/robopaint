/**
 * @file Contains all the required parts for managing flattening of art and
 * creation of toolpath lines for machine tracing strokes.
 * Depends on canvas module, robopaint.
 */
 "use strict";
var _ = require('underscore');

var settings = {
  traceIterationMultiplier: 2,
  lineWidth: 10,
  flattenResolution: 15
};

// General state variables (reset via shutdown below)
var traceChildrenMax = 0;
var currentTraceChild = 1;
var runTraceSpooling = false;
var tracePaths = [];
var tpIndex = 0; // Current tracePath
var cPathPos = 0; // Position on current tracing path
var lastGood = false; // Keep track if the last hit was good
var lastItem = null;
var totalLength = 0; // For tracking completion status

module.exports = function(paper) {
  // Emulate PaperScript "Globals" as needed
  var Point = paper.Point;
  var Path = paper.Path;

  // Shortcuts for long lines.
  var snapColorID = paper.utils.snapColorID;
  var snapColor = paper.utils.snapColor;
  var getClosestIntersection = paper.utils.getClosestIntersection;

  paper.stroke = {
    settings: settings,

    // Copy the needed parts for tracing (all paths with strokes) and their fills
    setup: function () {
      var tmp = paper.canvas.tempLayer;
      tmp.activate();
      tmp.removeChildren(); // Clear it out

      // Move through all child items in the mainLayer and copy them into temp
      _.each(paper.canvas.mainLayer.children, function(path){
        path.copyTo(tmp);
      });

      // Ungroup all groups copied
      paper.utils.ungroupAllGroups(tmp);

       // Move through each temp item to prep them
      var maxLen = 0;
      _.each(tmp.children, function(path){
        maxLen += path.length;
        path.strokeColor = (path.strokeColor && path.strokeWidth) ? snapColor(path.strokeColor) : snapColor(path.fillColor);
        path.data.color = snapColorID(path.strokeColor, path.opacity);
        path.data.name = path.name;
        path.fillColor = path.fillColor ? snapColor(path.fillColor) : null;
        path.strokeWidth = settings.lineWidth;

        // Close stroke paths with fill to ensure they fully encompass the filled
        // color (only when they have a fillable color);
        if (!path.closed) {
          if (path.fillColor !== null) {
            if (snapColorID(path.fillColor) !== 'color8') {
              path.closed = true;
            }
          }
        }
      });

      // Keep the user up to date with what's going on.
      traceChildrenMax = tmp.children.length;
      mode.run([
        ['status', i18n.t('libs.spool.stroke', {id: '1/' + traceChildrenMax}), true],
        ['progress', 0, maxLen]
      ]);

      // Begin the trace, write to the actionLayer
      paper.canvas.actionLayer.activate();
      runTraceSpooling = true;
    },

    onFrameStep: function() {
      for (var i = 0; i < settings.traceIterationMultiplier; i++) {
        if (runTraceSpooling) {
          if (!traceStrokeNext()) { // Check for trace complete
            paper.stroke.shutdown();

            // Run complete callback, if set.
            if (_.isFunction(paper.stroke.complete)) {
              paper.stroke.complete();
            }
          }
        }
      }
    },

    shutdown: function() {
      runTraceSpooling = false;
      traceChildrenMax = 0;
      currentTraceChild = 1;
      runTraceSpooling = false;
      tracePaths = [];
      tpIndex = 0;
      cPathPos = 0;
      lastGood = false;
      lastItem = null;
      totalLength = 0;
    }
  };

  // Iterationally process each path to be traced from temp paths
  function traceStrokeNext() {
    // 1. Do we have temp paths?
    // 2. Move from bottom paths to top, removing each as we go.
    // 3. Move through
    // 4. Just convert the whole path if it's the last one
    // 5. Profit?!?

    var tmp = paper.canvas.tempLayer;
    if (tmp.children.length === 0) {
      return false;
    }

    var cPath = tmp.children[0]; // 0 is always current because we delete it when done!

    // Ignore white paths (color id 8)
    // TODO: This should probably be handled depending on number of colors in the
    // media (you can have more pens than 8), paper color might not be white.
    if (cPath.data.color === 'color8') {
      console.log('REMOVE WHITE STROKE:', cPath);
      cPath.remove(); return true;
    }

    // Current trace path doesn't exist? Make it!
    if (!tracePaths[tpIndex]) {
      tracePaths[tpIndex] = new Path({
        strokeColor: cPath.strokeColor,
        data: {color: cPath.data.color, name: cPath.data.name, type: 'stroke'},
        strokeWidth: settings.lineWidth,
        strokeCap: 'round',
        miterLimit: 1
      });

      // Make Water preview paths blue and transparent
      if (tracePaths[tpIndex].data.color === 'water2') {
        tracePaths[tpIndex].strokeColor = '#256d7b';
        tracePaths[tpIndex].opacity = 0.5;
      }
    }

    var tp = tracePaths[tpIndex];

    // If it's a compound path, break it apart
    if (cPath.children) {
      cPath.parent.insertChildren(0, cPath.removeChildren());
      cPath.remove();

      return true;
    }

    // Last path!
    if (tmp.children.length === 1) {
      tp.add(cPath.getPointAt(cPathPos));
    } else { // Not the last path...

      // Check if the current point matches the hittest
      var testPoint = cPath.getPointAt(cPathPos);

      // Note: In checking for stroke overlaps, we can't reliably test for stroke
      // intersection with hittest as it takes the stroke width into account,
      // not actual path intersection. Meaning that any stroke point that
      // touches another stroke width without intersecting the actual path
      // will cause closest intersection connection issues.
      var h = tmp.hitTest(testPoint);
      if (h.item === cPath) { // We're on the current path! Add a point
        // If we came off a bad part of the path, add the closest intersection
        if (!lastGood && lastItem && getClosestIntersection(cPath, lastItem, testPoint) && h.type !== 'stroke') {
          tp.add(getClosestIntersection(cPath, lastItem, testPoint));
        }

        tp.add(testPoint);
        lastGood = true;
      } else { // We're obstructed
        if (tp.segments.length) {
          tpIndex++; // Increment only if this path is used
          // If we came off a good part of the path, add the intersection closest
          if (lastGood && getClosestIntersection(cPath, h.item, testPoint) && h.type !== 'stroke') {
            tp.add(getClosestIntersection(cPath, h.item, testPoint));
          }
        }

        lastGood = false;
      }

      lastItem = h.item;
    }

    if (cPathPos === cPath.length) { // Path is done!
      if (currentTraceChild !== traceChildrenMax) currentTraceChild++;
      mode.run('status', i18n.t('libs.spool.stroke', {id: currentTraceChild + '/' + traceChildrenMax}), true);

      cPath.remove();
      lastGood = false;
      lastItem = null;
      cPathPos = 0;
      if (tp.length > 0) { // Increment only if this path is used
        tpIndex++;
      } else { // If it wasn't used, can it so the next one gets a clean start.
        tp.remove();
        tracePaths[tpIndex] = null;
      }
    } else { // Next part of the path
      cPathPos+= settings.flattenResolution; // Increment the path position.

      // If we're too far, limit it and it will be the last point added
      if (cPathPos > cPath.length) {
        totalLength+= cPath.length - (cPathPos - settings.flattenResolution);
        cPathPos = cPath.length;
      } else {
        totalLength+= settings.flattenResolution;
      }

      mode.run('progress', totalLength);
    }

    return true;
  }
 };
