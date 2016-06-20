/**
 * @file Contains all the required parts for managing flattening of art and
 * creation of toolpath lines for machine tracing fills.
 */
/* globals rpRequire, window, i18n, robopaint */

var _ = require('underscore');


// If we're not in a mode environment, set to false.
var mode = (typeof window.mode === 'undefined') ? false : window.mode;

// Settings template: pass any of these options in with the first setup argument
// to override. Second argument then becomes completion callback.
// These values are subject to change by global robopaint.settings defaults, See
// those values for current values.
var settings = {
  path: null, // Pass a path object to only fill that object.
  // Otherwise everything will be traced for fill.
  pathColor: null, // Pass the override color to replace the path color with.
  noFill: false, // If true, will exit and trigger callback immediately.
  // ^ This option really only exists to allow overriding the global setting.
  traceIterationMultiplier: 2, // Amount of work done in each frame.
  lineWidth: 10, // The size of the visual representation of the stroke line.
  flattenResolution: 15, // Path overlay fill type trace resolution.
  fillType: 'zigzag', // zigzag, zigstraight, zigsmooth, overlay
  // Pass a path object to be used for overlay fills:
  overlayFillPath: null, // Otherwise uses giant spiral.
  overlayFillAlignPath: true, // Align overlay fill to path, else align to view.
  angle: 28, // Dynamic line fill type line angle
  insetAmount: 0, // Amount to negatively offset the fill path.
  randomizeAngle: false, // Randomize the angle above for dynamic line fill.
  hatch: false, // If true, runs twice at opposing angles
  spacing: 13, // Dynamic line fill spacing nominally between each line.
  checkFillOcclusion: true, // Check for occlusion on fills?
  threshold: 40 // Dynamic line grouping threshold
};

// General state variables (reset via shutdown below)
var state = {
  runFillSpoolin: false,
  traceChildrenMax: 0,
  currentTraceChild: 1,
  totalSteps: 0, // Keep track of total step changes for user.
};

var currentFillAlgo = {}; // Hold onto the setup selected fill algorithm object.

module.exports = function(paper) {
  // Populate all fill algorithms from their modules.
  var fillAlgos = [
    rpRequire('fill_algo_line'),
    rpRequire('fill_algo_overlay'),
    rpRequire('fill_algo_cam'),
  ];

  // Shortcuts for long lines.
  var snapColorID = paper.utils.snapColorID;
  var snapColor = paper.utils.snapColor;


  paper.fill = {
    settings: settings,

    setup: function (overrides, callback) {
      if (_.isFunction(overrides)) callback = overrides; // No overrides

      // Get global Settings
      var set = robopaint.settings;

      var setMap = { // Map global settings to local stroke module settings.
        traceIterationMultiplier: parseInt(set.autofilliteration),
        lineWidth: parseInt(set.autofillwidth),
        flattenResolution: parseInt(set.fillprecision) * 2,
        fillType: set.filltype,
        overlayFillAlignPath: set.fillspiralalign == true, // jshint ignore:line
        angle: parseInt(set.fillangle),
        randomizeAngle: set.fillrandomize == true, // jshint ignore:line
        noFill: set.autofillenabled == false, // jshint ignore:line
        hatch: set.fillhatch == true, // jshint ignore:line
        spacing: parseInt(set.fillspacing) * 2,
        insetAmount: set.fillinset,
        checkFillOcclusion: set.fillocclusionfills == true, // jshint ignore:line
        threshold: parseInt(set.fillgroupingthresh)
      };

      // Merge in local settings, global settings, and passed overrides.
      settings = _.extend(settings, setMap, overrides);

      // Leave early if we're destined not to actually do anything here.
      if (settings.noFill) {
        if (_.isFunction(callback)) callback();
        return;
      }

      // TODO: I'm in denial that the only valid overlay path is a spiral...
      // till then, i'm going to swap in overlay w/o a path for spiral :P
      if (settings.fillType === 'spiral') {
        settings.fillType = 'overlay';
      }

      // Populate the fill algorithm controller object.
      _.forEach(fillAlgos, function(algo) {
        if (algo.provides.indexOf(settings.fillType) > -1) {
          currentFillAlgo = algo;
        }
      });

      // If we don't have a fill algorithm selected by now, can't continue.
      if (!currentFillAlgo) {
        console.warn(
          'Illegal fill type no loaded fill algorithm provides:',
          settings.fillType
        );
        return;
      } else {
        currentFillAlgo.setup({
          mode: mode,
          state: state,
          paper: paper,
          settings: settings,
          getClosestIntersectionID: paper.utils.getClosestIntersectionID,
          Point: paper.Point,
          Path: paper.Path,
          view: paper.view,
          CompoundPath: paper.CompoundPath,
        });
      }

      paper.fill.complete = callback; // Assign callback
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
            t.fillColor = paper.utils.snapColor(settings.pathColor);
          }
        }
      }

      // Ungroup all groups copied
      paper.utils.ungroupAllGroups(tmp);

      // Filter out non-fill paths, and ensure paths are closed.

      // If you modify the child list, you MUST operate on a COPY
      var kids = _.extend([], tmp.children);
      _.each(kids, function(path) {
        if (!paper.utils.hasColor(path.fillColor)) {
          path.remove();
        } else {
          path.closed = true;
          path.data.color = snapColorID(path.fillColor, path.opacity);
          path.data.name = path.name;
          path.fillColor = snapColor(path.fillColor, path.opacity);
          path.strokeWidth = 0;
          path.strokeColor = null;

          // Be sure to set the correct color/tool if given.
          if (path.data.targetPath && settings.pathColor) {
            path.data.color = settings.pathColor;
          }
        }
      });

      // Move through each temp layer child and subtract each layer from the
      // previous, again and again, only if we're checking occlusion.
      if (settings.checkFillOcclusion) {
        for (var srcIndex = 0; srcIndex < tmp.children.length; srcIndex++) {
          var srcPath = tmp.children[srcIndex];
          srcPath.data.processed = true;

          // Replace this path with a subtract for every intersecting path,
          // starting at the current index (lower paths don't subtract from
          // higher ones)
          var tmpLen = tmp.children.length;
          for (var destIndex = srcIndex; destIndex < tmpLen ; destIndex++) {
            var destPath = tmp.children[destIndex];
            if (destIndex !== srcIndex) {
              var tmpPath = srcPath; // Hold onto the original path

              // Set the new srcPath to the subtracted one inserted at the
              // same index.
              srcPath = tmp.insertChild(srcIndex, srcPath.subtract(destPath));
              srcPath.data = _.extend({}, tmpPath.data);
              tmpPath.remove(); // Remove the old srcPath
            }
          }
        }
      }

      // Apply inset to these temp fill paths while we have them.
      if (settings.insetAmount) {
        kids = _.extend([], tmp.children);
        _.each(kids, function(path) {
          paper.utils.offsetPath(
            path,
            -settings.insetAmount,
            settings.flattenResolution
          );
        });
      }

      // Keep the user up to date
      if (settings.path) {
        // We have to deal with all the paths, but we're only filling one.
        state.traceChildrenMax = 1;

        // Hide the final paths for single path filling
        _.each(tmp.children, function(path){
          if (settings.path && !path.data.targetPath) {
            path.opacity = 0;
          }
        });
      } else {
        state.traceChildrenMax = tmp.children.length;
      }

      state.currentTraceChild = 1;
      if (mode) {
        mode.run([
          [
            'status',
            i18n.t('libs.spool.fill', {id: '1/' + state.traceChildrenMax}),
            true
          ],
          // 2 steps for fill: lines & groups.
          ['progress', 0, state.traceChildrenMax * 2]
        ]);
      }

      // Begin the trace, write to the actionLayer
      paper.canvas.actionLayer.activate();
      state.runFillSpooling = true;
    },

    onFrameStep: function() {
      for(var i = 0; i < settings.traceIterationMultiplier; i++) {
        if (state.runFillSpooling) { // Are we doing fills?
          if (!traceFillNext()){ // All paths complete?
            paper.fill.shutdown();

            if (_.isFunction(paper.fill.complete)) {
              paper.fill.complete();
            }
          }
        }
      }
    },

    shutdown: function() {
      state.runFillSpooling = false;
      settings.path = null; // Only kept per setup run.
      if (currentFillAlgo.reset) {
        currentFillAlgo.reset(); // Reset inside the fill algorithm.
      }
      currentFillAlgo = {};
      state.traceChildrenMax = 0;
      state.currentTraceChild = 1;
      state.totalSteps = 0;
    }
  };

  // Iteratively pick the next fill path to apply fill algo to.
  function traceFillNext() {
    // Select the next bottommost fill path to apply the fill algorithm to.
    var fillPath = paper.canvas.tempLayer.firstChild;

    // If we're not checking occlusion, we can just grab the top layer.
    if (!settings.checkFillOcclusion && settings.fillType === 'overlay') {
      fillPath = paper.canvas.tempLayer.lastChild;
    }

    // If we're out of paths to fill, we're done!
    if (!fillPath) {
      // Before we're completely done, clean up any stray working paths we made
      // that don't actually have any length (or use!);
      var kids = _.extend([], paper.canvas.actionLayer.children);
      _.each(kids, function(p){
        if(!p.length) p.remove();
      });

      return false;
    }

    // Ignore white paths (color id 8)
    // TODO: This should probably be handled depending on num of colors in the
    // media (you can have more pens than 8), paper color might not be white.
    if (fillPath.data.color === 'color8') {
      fillPath.remove();
      return true;
    }

    // I've we're only filling one path, delete any we encounter that aren't it.
    // This allows for seamless path occlusion tracing without side effects.
    if (settings.path) {
      if (!fillPath.data.targetPath) {
        fillPath.remove();
        return true;
      }
    }

    // Ignore 0 width/height fill paths.
    if (fillPath.bounds.width === 0 || fillPath.bounds.height === 0) {
      fillPath.remove(); return true;
    }

    // Actually run the fill path step for the current fill algorithm.
    return currentFillAlgo.fillPathStep(fillPath);
  }

};
