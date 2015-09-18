/**
 * @file Robopaint->Mode->Paper.JS include module. Contains useful paper.js
 *  paper.js not tied to mode specific use that will be attached to the passed
 *  paper object under paper.utils
 */
"use strict";
module.exports = function(paper) {
  // Emulate PaperScript "Globals" as needed
  var Point = paper.Point;
  var Path = paper.Path;
  var view = paper.view;

  paper.utils = {

    // Return true if the layer contains any groups at the top level
    layerContainsGroups: function (layer) {
      for(var i in layer.children) {
        if (layer.children[i] instanceof paper.Group) return true;
      }
      return false;
    },

    // Ungroup any groups recursively
    ungroupAllGroups: function (layer) {
      // Remove all groups
      while(paper.utils.layerContainsGroups(layer)) {
        for(var i in layer.children) {
          var path = layer.children[i];
          if (path instanceof paper.Group) {
            path.parent.insertChildren(0, path.removeChildren());
            path.remove();
          }
        }
      }
    },

    // Snap the given color to the nearest tool ID
    // TODO: When refactoring media sets, pull tool names from definition.
    snapColorID: function (color, opacity) {
      if (typeof opacity !== 'undefined' & opacity < 1) {
        return 'water2';
      }

      return "color" + robopaint.utils.closestColor(color.toCSS(), robopaint.media.currentSet.colors);
    },

    // Get the actual color of the nearest color to the one given.
    snapColor: function (color) {
      return robopaint.media.currentSet.colors[paper.utils.snapColorID(color).substr(-1)].color.HEX;
    },

    // Get only the ID of closest point in an intersection array.
    getClosestIntersectionID: function (srcPoint, points) {
      var closestID = 0;
      var closest = srcPoint.getDistance(points[0].point);

      _.each(points, function(destPoint, index){
        var dist = srcPoint.getDistance(destPoint.point);
        if (dist < closest) {
          closest = dist;
          closestID = index;
        }
      });

      return closestID;
    },

    // Return the closest intersection of the two given paths to the given point
    getClosestIntersection: function (path1, path2, point) {
      var ints = path1.getIntersections(path2);
      if (!ints.length) return null; // No intersections? huh

      return ints[paper.utils.getClosestIntersectionID(point, ints)];
    },


    // Find the closest point to a given source point from an array of point groups.
    closestPointInGroup: function (srcPoint, pathGroup) {
      var closestID = 0;
      var closestPointIndex = 0;
      var closest = srcPoint.getDistance(pathGroup[0].points[0]);

      _.each(pathGroup, function(p, index){
        _.each(p.points, function(destPoint, pointIndex){
          var dist = srcPoint.getDistance(destPoint);
          if (dist < closest) {
            closest = dist;
            closestID = index;
            closestPointIndex = pointIndex;
          }
        })
      });

      return {id: closestID, closestPointIndex: closestPointIndex, dist: closest};
    },

    // Order a layers children by top left travel path from tip to tail, reversing
    // path order where needed, grouped by data.color. Only works with paths,
    // not groups or compound paths as it needs everything on an even playing
    // field to be reordered.
    travelSortLayer: function(layer) {
      var a = layer;

      // 1. Move through all paths, group into colors
      // 2. Move through each group, convert list of paths into sets of first and
      //    last segment points, ensure groups are sorted by luminosity.
      // 3. Find the point closest to the top left corner. If it's an end, reverse
      //    the path associated, make the first point the next one to check, remove
      //    the points from the group.
      // 4. Rinse and repeat!

      // Prep the colorGroups
      var sortedColors = robopaint.media.sortedColors();
      var colorGroups = {};
      _.each(sortedColors, function(tool) {
        colorGroups[tool] = [];
      })

      // Put each path in the sorted colorGroups, with its first and last point
      _.each(a.children, function(path){
        colorGroups[path.data.color].push({
          path: path,
          points: [path.firstSegment.point, path.lastSegment.point]
        });
      });

      // Move through each color group, then each point set for distance
      var drawIndex = 0; // Track the path index to insert paths into on the layer
      _.each(colorGroups, function(group){
        var lastPoint = new Point(0, 0); // Last point, start at the corner
        var lastPath = null; // The last path worked on for joining 0 dist paths

        while(group.length) {
          var c = paper.utils.closestPointInGroup(lastPoint, group);

          // First segment, or last segment?
          if (c.closestPointIndex === 0) { // First
            // Set last point to the end of the path
            lastPoint = group[c.id].points[1];
          } else { // last
            // Reverse the path direction, so its first point is now the last
             group[c.id].path.reverse();

            // Set last point to the start of the path (now the end)
            lastPoint = group[c.id].points[0];
          }


          // If the distance between the lastPoint and the next closest point is
          // 0, and our lastPoint is on a path, we can make this more efficient
          // by joining the two paths.
          if (c.dist === 0 && lastPath) {
            // Combine lastPath with this path (remove the remainder)
            lastPath.join(group[c.id].path);
          } else { // Non-zero distance, add as separate path
            // Insert the path to the next spot in the action layer.
            a.insertChild(drawIndex, group[c.id].path);
            lastPath = group[c.id].path;
          }

          group.splice(c.id, 1); // Remove it from the list of paths

          drawIndex++;
        }
      });
    },

    // Run an open linear segmented non-compound tracing path into the buffer
    runPath: function(path) {
      mode.run('up');
      var isDown = false;
      _.each(path.segments, function(seg){
        mode.run('move', {x: seg.point.x, y: seg.point.y});
        if (!isDown) {
          mode.run('down');
          isDown = true;
        }
      });

      // TODO: Extend the last point to account for brush bend
      //robopaint.settings.strokeovershoot;
      mode.run('up');
    },

    // Actually handle a fully setup action layer to be streamed into the buffer
    // in the path and segment order they're meant to be streamed.
    autoPaint: function(layer) {
      paper.utils.travelSortLayer(layer);
      var run = mode.run;
      // TODO: Pre-check to make sure the layer is fully ready, composed of only
      // completely open polygonal (linear) non-compound paths with no fill.

      // All paths on layer are expected to have data value object with:
      //  * data.color: media/toolName
      //  * data.name: name/id of the path
      //  * data.type: either "fill" or "stroke"

      var runColor;
      _.each(layer.children, function(path){
        // If the color doesn't match, be sure to wash & change it
        if (path.data.color !== runColor) {
          runColor = path.data.color;
          run(['wash', ['media', runColor]]);
        }

        var typeKey = 'stroke'
        if (path.data.type === "fill") {
          typeKey = 'fill';
        }

        // If it doesn't have a name, default to an empty string.
        if (typeof path.data.name === 'undefined') path.data.name = '';

        run('status', i18n.t('libs.auto' + typeKey, {id: path.data.name}))
        paper.utils.runPath(path);
      });

      // Wrap up
      run([
        'wash',
        'park',
        ['status', i18n.t('libs.autocomplete')],
        ['callbackname', 'autoPaintComplete']
      ]);
    }
  }
};
