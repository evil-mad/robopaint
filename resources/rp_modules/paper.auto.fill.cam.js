/**
 * @file Path fill algortihm module: Export function for running the dynamic
 * "cam" style offset fill utilizing the "clipper" and cam.js libraries.
 */
/* globals _, rpRequire */

var ClipperLib = rpRequire('clipper');
var jscut = rpRequire('jscut')(ClipperLib);


// Global variable holder.
// TODO: Is there a better way to access/store module globals like this?
var g = {};


module.exports = {
  provides: ['cam'],
  fillPathStep: shapeFillPath,
  setup: function(globals) {
    // Populate the passed globals into the G object.
    _.each(globals, function(value, key) {
      g[key] = value;
    });
  },
  reset: function() {

  }
};

/**
 * Convert an incoming filled path into a set of cam paths.
 *
 * @param  {pathItem} inPath
 *  The fill path to work with.
 *
 * @return {Boolean}
 *   Whether we're not done with everything. False if done, true if not done.
 */
function shapeFillPath(inPath) {
  // 1. Copy the input path and flatten to a polygon (or multiple gons).
  // 2. Convert the polygon(s) points into the clipper array format.
  // 3. Delete the temp path.
  // 4. Run the paths array through jscut.
  // 5. Output the paths as a cam fill compound path.

  var p = inPath.clone();
  var geometries = [];
  var scale = 100000;
  var pxPerInch = 96;
  var spacing = g.settings.spacing / 5;

  // Is this a compound path?
  if (p.children) {
    _.each(p.children, function(c, pathIndex) {
      if (!c.length) return false;
      c.flatten(g.settings.flattenResolution);
      geometries[pathIndex] = [];
      _.each(c.segments, function(s){
        geometries[pathIndex].push({
          X: Math.round(s.point.x * scale / pxPerInch),
          Y: Math.round(s.point.y * scale / pxPerInch),
        });
      });
    });
  } else { // Single path.
    // With no path length, we're done.
    if (!p.length) {
      p.remove();
      inPath.remove();
      return true;
    }

    geometries[0] = [];
    p.flatten(g.settings.flattenResolution);
    _.each(p.segments, function(s){
      geometries[0].push({
        X: Math.round(s.point.x * scale / pxPerInch),
        Y: Math.round(s.point.y * scale / pxPerInch),
      });
    });
  }

  // Get rid of our temporary poly path
  p.remove();

  var cutConfig = {
    tool: {
      units: "inch",
      diameter: spacing / 25.4, // mm to inches
      stepover: 1
    },
    operation: {
      camOp: "Pocket",
      units: "inch",
      geometries: [geometries]
    }
  };

  var cutPaths = jscut.cam.getCamPaths(cutConfig.operation, cutConfig.tool);

  // If there's a result, create a compound path for it.
  if (cutPaths) {
    var pathString = jscut.cam.toSvgPathData(cutPaths, pxPerInch);
    var camPath = new g.CompoundPath(pathString);
    camPath.data = {
      color: inPath.data.color,
      name: inPath.data.name,
      type: 'fill'
    };
    camPath.scale(1, -1); // Flip vertically (clipper issue)
    camPath.position = new g.Point(camPath.position.x, -camPath.position.y);

    // Make Water preview paths blue and transparent
    if (inPath.data.color === 'water2') {
      camPath.strokeColor = '#256d7b';
      camPath.opacity = 0.5;
    }

    camPath.strokeColor = inPath.fillColor;
    camPath.strokeWidth = g.settings.lineWidth;

    console.log(camPath);
    inPath.remove();
    g.view.update();
    return true;
  } else {
    inPath.remove();
    // Too small to be filled.
    return true;
  }
}
