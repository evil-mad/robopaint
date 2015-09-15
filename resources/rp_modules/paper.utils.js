/**
 * @file Robopaint->Mode->Paper.JS include module. Contains useful paper.js
 *  paper.js not tied to mode specific use that will be attached to the passed
 *  paper object under paper.utils
 */
"use strict";
module.exports = function(paper) {
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
    }

  }
};
