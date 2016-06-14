/**
 * @file Contains all the required parts for managing flattening of art and
 * creation of toolpath lines for machine tracing strokes.
 * Depends on canvas module, robopaint.
 */
 "use strict";
var _ = require('underscore');

// If we're not in a mode environment, set to false.
var mode = (typeof window.mode === 'undefined') ? false : window.mode;

// Settings template: pass any of these options in with the first setup argument
// to override. Second argument then becomes completion callback.
// These values are subject to change by global robopaint.settings defaults, See
// those values for current values.
var settings = {
  path: null, // Pass a path object to only stroke that object.
  // Otherwise everything will be traced for strokes.
  pathColor: null, // Pass the override color to replace the path color with.
  noStroke: false, // If true, will exit and trigger callback immediately.
  // ^ This option really only exists to allow overriding the global setting.
  traceIterationMultiplier: 2, // Amount of work done in each frame.
  lineWidth: 10, // The size of the visual representation of the stroke line.
  flattenResolution: 15, // Stroke polygonal conversion resolution
  strokeAllFilledPaths: true, // Stroke non-stroked filled paths?
  strokeNoStrokePaths: true, // Stroke non-stroke non-filled paths?
  closeFilledPaths: false, // Close all filled paths? Pertains to above.
  checkFillOcclusion: true, // Check for occlusion on fills?
  checkStrokeOcclusion: false, // Check for occlusion on other strokes?
  ignoreSameColor: false, // Ignore trace occlusion for same color.
  ignoreTransparentOcclusion: true // Ignore trace occlusion for transparents.
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
    setup: function (overrides, callback) {
      if (_.isFunction(overrides)) callback = overrides; // No overrides

      // Get global Settings
      var set = robopaint.settings;

      var setMap = { // Map global settings to local stroke module settings.
        traceIterationMultiplier: parseInt(set.autostrokeiteration),
        lineWidth: parseInt(set.autostrokewidth),
        flattenResolution: set.strokeprecision * 4,
        noStroke: set.autostrokeenabled == false,
        strokeAllFilledPaths: set.strokefills == true,
        strokeNoStrokePaths: set.strokeinvisible == true,
        closeFilledPaths: set.strokeclosefilled == true,
        checkFillOcclusion: set.strokeocclusionfills == true,
        checkStrokeOcclusion: set.strokeocclusionstoke == true,
        ignoreSameColor: set.strokeocclusioncolor == true,
        ignoreTransparentOcclusion: set.strokeocclusionwater == true
      }

      // No occlusion detection
      if (!set.autostrokeocclusion) {
        setMap.checkFillOcclusion = setMap.checkStrokeOcclusion = false;
      }

      // Merge in local settings, global settings, and passed overrides.
      settings = _.extend(settings, setMap, overrides);

      // Leave early if we're destined not to actually do anything here.
      if (settings.noStroke) {
        if (_.isFunction(callback)) callback();
        return;
      }

      paper.stroke.complete = callback; // Assign callback
      var tmp = paper.canvas.tempLayer;
      tmp.activate();
      tmp.removeChildren(); // Clear it out

      // Move through all child items in the mainLayer and copy them into temp
      for (var i = 0; i < paper.canvas.mainLayer.children.length; i++) {
        var path = paper.canvas.mainLayer.children[i];
        var t = path.copyTo(tmp);

        // If this is the only path we'll be tacing...
        if (settings.path === path) {
          // Mark the new temp path copy.
          t.data.targetPath = true;

          // And make sure to set its fill color!
          if (settings.pathColor) {
            t.strokeColor = paper.utils.snapColor(settings.pathColor);
            t.strokeWidth = 10; // As long as it's something...
          }
        }
      }

      // Ungroup all groups copied
      paper.utils.ungroupAllGroups(tmp);

      // Shortcut hasColor
      var hasColor = paper.utils.hasColor;

       // Move through each temp item to prep them
      var maxLen = 0;
      _.each(tmp.children, function(path) {

        // Change stroke action depending on path "color type".
        var doStroke = true; // Assume we're stroking the path
        switch(paper.utils.getPathColorType(path)) {
          case 1: // Type 1: Stroked filled shape
            paper.utils.setPathOption(path, 'fillColor', snapColor(path.fillColor, path.opacity));
          case 2: // Type 2: Stroked non-filled shape
            paper.utils.setPathOption(path, 'strokeColor', snapColor(path.strokeColor, path.opacity));
            break;
          case 3: // Type 3: Filled no stroke shape
            paper.utils.setPathOption(path, 'fillColor', snapColor(path.fillColor, path.opacity));
            if (settings.strokeAllFilledPaths) {
              paper.utils.setPathOption(path, 'strokeColor', snapColor(path.fillColor, path.opacity));
            } else {
              paper.utils.setPathOption(path, 'strokeWidth', 0); // Ensure it's ignored later
              doStroke = false;
            }
            break;
          case 4: // Type 4: No fill, no stroke shape (invisible)
            if (settings.strokeNoStrokePaths) {
              paper.utils.setPathOption(path, 'strokeColor', snapColor(path.strokeColor, path.opacity));
            } else {
              paper.utils.setPathOption(path, 'strokeWidth', 0); // Ensure it's ignored later
              doStroke = false;
            }
            break;
        }

        // If we're actually stroking this path, make it visible with a stroke
        // width and add its length to the max for checking progress.
        if (doStroke) {
          var data = {
            color: snapColorID(path.strokeColor, path.opacity),
            name: path.name,
            targetPath: path.data.targetPath,
          };

          // Be sure to set the correct color/tool if given.
          if (data.targetPath && settings.pathColor) {
            data.color = settings.pathColor;
          }

          paper.utils.setPathOption(path, 'data', data);
          paper.utils.setPathOption(path, 'strokeWidth', settings.lineWidth);
          path.originalOpacity = path.opacity;
          maxLen += paper.utils.getPathLength(path);
        }

        // If only stroking one path, visually hide all the other paths.
        if (settings.path && !path.data.targetPath) {
          //path.opacity = 0;
        }

        // Close stroke paths with fill to ensure they fully encompass the filled
        // color (only when they have a fillable color);
        if (!path.closed && settings.closeFilledPaths) {
          if (hasColor(path.fillColor)) {
            if (snapColorID(path.fillColor, path.opacity) !== 'color8') {
              path.closed = true;
            }
          }
        }
      });

      // Keep the user up to date with what's going on...
      if (settings.path) {
        // We have to deal with all the paths, but we're only stroking one.
        traceChildrenMax = 1;
        maxLen = settings.path.length;
      } else {
        traceChildrenMax = tmp.children.length;
      }

      if (mode) {
        mode.run([
          ['status', i18n.t('libs.spool.stroke', {id: '1/' + traceChildrenMax}), true],
          ['progress', 0, maxLen]
        ]);
      }

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
      settings.path = null; // Only kept per setup run.
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

    // I've we're only tracing one path, delete any we encounter that aren't it.
    // This allows for seamless path occlusion tracing without side effects.
    if (settings.path) {
      if (!cPath.data.targetPath) {
        cPath.remove();
        return true;
      }
    }

    // If the path we're meant to trace doesn't have a stroke width, skip it.
    // This is how the setup process marks paths that are meant to be used, but
    // not actually stroked.
    if (!cPath.strokeWidth) {
      cPath.remove();
      return true;
    }

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
    }

    var tp = tracePaths[tpIndex];

    // If it's a compound path, break it apart
    if (cPath.children) {
      cPath.parent.insertChildren(0, cPath.removeChildren());
      cPath.remove();

      return true;
    }

    // Last path! (or completely ignoring occlusion)
    if (tmp.children.length === 1 || (!settings.checkStrokeOcclusion && !settings.checkFillOcclusion)) {
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

      // Standard fill/stroke checking: if the hit result item is the same as
      // our current path, keep going!
      var continueStroke = (h.item === cPath);

      // Continue the stroke if we're not checking fills.
      if (!continueStroke && !settings.checkFillOcclusion && h.type === 'fill') {
        continueStroke = true;
      }

      // Continue the stroke if we're not checking strokes.
      if (!continueStroke && !settings.checkStrokeOcclusion && h.type === 'stroke') {
        continueStroke = true;
      }

      // We don't check for a no stroke no fill settings, as that would result
      // in NO occlusion detection whatsoever, and that's covered above! ^^^^

      // If it's the same color and we're ignoring same color, save it!
      if (!continueStroke && ['fill', 'stroke'].indexOf(h.type) > -1 && settings.ignoreSameColor) {
        if (h.item[h.type + 'Color'].toCSS() === cPath.strokeColor.toCSS()) {
          continueStroke = true;
        }
      }

      // If it's a transparent color and we're ignoring transparent color, save it!
      if (!continueStroke && ['fill', 'stroke'].indexOf(h.type) > -1 && settings.ignoreTransparentOcclusion) {
        var c = h.item[h.type + 'Color'];
        if (paper.utils.hasColor(c)) {
          if (h.item.originalOpacity < 1 || c.alpha < 1) {
            continueStroke = true;
          }
        }
      }

      // If the above rules say we're to keep stroking.. lets go!
      if (continueStroke) {
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

      if (mode) {
        mode.run('status', i18n.t('libs.spool.stroke', {id: currentTraceChild + '/' + traceChildrenMax}), true);
      }


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

      if (mode) {
        mode.run('progress', totalLength);
      }
    }

    return true;
  }
 };
