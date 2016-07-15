/**
 * @file Path fill algortihm module: Export function for running the dynamic
 * line fill (overlaying lines at an angle over a filled path).
 */
/* globals _, i18n */

var cFillIndex = 0; // Keep track of which line we're working on
var cSubIndex = 0; // Keep track of which sub we're working on
var cStep = 0; // Which fill step are we on?
var lastPath = null; // The last fillpath
var cGroup = null; // The current line grouping
var lines = []; // Lines to be regrouped during fill

// Global variable holder.
// TODO: Is there a better way to access/store module globals like this?
var g = {};

module.exports = {
  provides: ['zigzag', 'zigstraight', 'zigsmooth'],
  fillPathStep: dynamicLineFillNext,
  setup: function(globals) {
    // Populate the passed globals into the G object.
    _.each(globals, function(value, key) {
      g[key] = value;
    });
  },
  getStepMax: function(pathCount) {
    // 2 steps for fill: lines & groups.
    return pathCount * 2;
  },
  reset: function() {
    cFillIndex = 0;
    cSubIndex = 0;
    cStep = 0;
    cGroup = null;
    lines = [];
    lastPath = null;
  }
};

// Dyanamic line fill iterative function (called from traceFillNext)
function dynamicLineFillNext(fillPath) {
  // 1. Assume line is ALWAYS bigger than the entire object
  // 2. If filled path, number of intersections will ALWAYS be multiple of 2
  // 3. Grouping pairs will always yield complete line intersections.
  var p = fillPath;
  var type = g.settings.fillType;

  // Run once per unique fillPath
  if (lastPath !== fillPath) {
    lastPath = fillPath;

    // Swap angle for random angle if randomizeAngle set.
    if (g.settings.randomizeAngle && !p.data.randomAngleSet) {
      p.data.randomAngleSet = true;
      g.settings.angle = Math.ceil(Math.random() * 179);
    }
  }

  // Choose the iteration fill step
  switch (cStep) {
    case 0: // Adding initial fill lines
      // Init boundpath and traversal line
      // The path drawn around the object the line traverses
      var boundPath = new g.Path.Ellipse({
        center: p.position,
        size: [p.bounds.width * 2 , p.bounds.height * 2]
      });

      // Set start & destination based on input angle
      // Divide the length of the bound ellipse into 1 part per angle
      var amt = boundPath.length/360;

      // Set source position to calculate iterations and create dest vector.
      var pos = amt * (g.settings.angle);

      // The actual line used to find the intersections
      // Ensure line is far longer than the diagonal of the object
      var line = new g.Path({
        segments: [
          new g.Point(0, 0),
          new g.Point(p.bounds.width + p.bounds.height, 0)
        ],
        position: boundPath.getPointAt(pos),
        rotation: g.settings.angle - 90
      });

      if (g.settings.debug) {
        boundPath.strokeColor= 'black';
        boundPath.strokeWidth= 2;
        line.strokeColor = 'red';
        line.strokeWidth = 2;
        g.paper.view.update();
      }

      // Find destination position on other side of circle
      pos = g.settings.angle + 180;  if (pos > 360) pos -= 360;
      var len = Math.min(boundPath.length, pos * amt);
      var destination = boundPath.getPointAt(len);

      // Find vector and length divided by line spacing to get # iterations.
      var vector = destination.subtract(line.position);
      var iterations = parseInt(vector.length / g.settings.spacing);

      // Move the line by a step.
      line.position = line.position.add(
        vector.divide(iterations).multiply(cFillIndex)
      );

      // Move through calculated iterations for given spacing
      var ints = checkBoundaryIntersections(line, line.getIntersections(p));

      if (ints.length % 2 === 0) { // If not dividable by 2, we don't want it!
        for (var x = 0; x < ints.length; x+=2) {

          var groupingID = findLineFillGroup(
            ints[x].point,
            lines,
            g.settings.threshold
          );

          var y = new g.Path({
            segments: [ints[x].point, ints[x+1].point],
            strokeColor: p.fillColor, // Will become fill color
            data: {color: p.data.color, name: p.data.name, type: 'fill'},
            strokeWidth: g.settings.lineWidth,
            miterLimit: 40,
            strokeJoin: 'round'
          });

          // Make Water preview paths blue and transparent
          if (y.data.color === 'water2') {
            y.strokeColor = '#256d7b';
            y.opacity = 0.5;
          }

          if (!lines[groupingID]) lines[groupingID] = [];
          lines[groupingID].push(y);
        }
      }

      cFillIndex++;

      // Num of iterations reached? Move to the next step & reset fillIndex
      if (cFillIndex === iterations) {
        cStep++;
        cFillIndex = 0;
        cSubIndex = 0;
        g.state.totalSteps++;
      }

      // Clean up our helper paths
      if (!g.settings.debug) {
        line.remove();
        boundPath.remove();
      }

      break;
    case 1: // Grouping and re-grouping the lines
      // Combine lines within position similarity groupings

      // If there are none, then the first step didn't ever actually touch the
      // shape. Must be pretty small! Finish up early.
      if (!lines[0]) {
        finishFillPath(fillPath);
        return true;
      }

      if (cSubIndex === 0) {
        if (!lines[cFillIndex]) {
          console.log(cFillIndex);
        }
        if (type === 'zigsmooth' && cGroup) {
          cGroup.simplify();
          cGroup.flatten(g.settings.flattenResolution);
        }

        cGroup = lines[cFillIndex][0];
        cSubIndex = 1;
      }

      if (typeof lines[cFillIndex][cSubIndex] !== 'undefined') {
        // Don't join lines that cross outside the path
        var v = new g.Path({
          segments: [
            cGroup.lastSegment.point,
            lines[cFillIndex][cSubIndex].firstSegment.point
          ]
        });

        //console.log('ints', v.getIntersections(p).length);

        // Find a point halfway between where these lines would be connected
        // If it's not within the path, don't do it!
        // TODO: This only removes the bad outliers, may need improvement!
        var hitCount = v.getIntersections(p).length;
        if (!p.contains(v.getPointAt(v.length/2)) || hitCount  > 3) {
          if (type === 'zigsmooth') {
            cGroup.simplify();
            if (cGroup.segments.length <= 1 && cGroup.closed) {
               cGroup.closed = false;
            }
            cGroup.flatten(g.settings.flattenResolution);
          }

          // Not contained, store the previous l & start a new grouping;
          cGroup = lines[cFillIndex][cSubIndex];
          //console.log('Tossed!');
        } else {
          // For straight/smooth zigzag, flip the lines around before joining
          // to ensure the line tries to join to the closest side.
          if (type === 'zigstraight' || type === 'zigsmooth') {
            var cLine = lines[cFillIndex][cSubIndex];
            var groupPoint = cGroup.lastSegment.point;
            var lastToFirst = groupPoint.getDistance(cLine.firstSegment.point);
            var lastToLast = groupPoint.getDistance(cLine.lastSegment.point);
            if (lastToFirst > lastToLast) {
              cLine.reverse();
            }

            // Add an extra point between the two ends being connected to keep
            // smoothing from going too crazy.
            if (type === 'zigsmooth') {
              var midPoint = groupPoint.subtract(
                groupPoint.subtract(cLine.firstSegment.point).divide(2)
              );
              cGroup.add(midPoint);
            }
          }

          // Join the current grouping and the next line
          cGroup.join(lines[cFillIndex][cSubIndex]);
        }

        // Remove our test line
        v.remove();
      }

      cSubIndex++; // Iterate subIndex

      // End of SubIndex Loop (multi)
      if (cSubIndex >= lines[cFillIndex].length) {
        cSubIndex = 0;

        cFillIndex++;
        if (cFillIndex >= lines.length) { // End of fill index loop (single)
          finishFillPath(fillPath);
          return true;
        }
      }
  }

  if (g.mode) {
    g.mode.run('progress', g.state.totalSteps);
  }
  return true;
}

// Attempt to find the corrent grouping for given line fills.
function findLineFillGroup(testPoint, lines, newGroupThresh){
  // If we don't have any groups yet.. return 0
  if (lines.length === 0) {
    return 0;
  }

  // 1. We go in order, which means the first segment point of the last
  //    line in each group is the one to check distance against
  // 2. Compare each, use the shortest...
  // 3. ...unless it's above the new group threshold, then return a group id

  var bestDistance = newGroupThresh;
  var groupID = 0;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i][lines[i].length-1];
    var dist = line.firstSegment.point.getDistance(testPoint);

    if (dist < bestDistance) {
      groupID = i;
      bestDistance = dist;
    }
  }

  // Check if we went over the threshold, make a new group!
  if (bestDistance === newGroupThresh) {
    groupID = lines.length;
  }

  return groupID;
}


/**
 * If any given intersections that are outside the view bounds, move them to
 * the nearest view boundary intersection.
 *
 * @param  {Paper.Path.Line} line
 *   The line to be checked.
 * @param  {array} intersections
 *   An array of intersections along the line, checked against the current
 *   view.bounds.
 *
 * @return {array}
 *   A sanity checked list of valid points within the view bounds.
 */
function checkBoundaryIntersections(line, intersections) {
  // Init canvas boundary line to intersect if beyond the printable area.
  var canvasBounds = new g.Path.Rectangle({
    from: [0, 0],
    to: [g.view.bounds.width, g.view.bounds.height]
  });

  var outPoints = [];

  var canvasBoundInts = line.getIntersections(canvasBounds);
  _.each(intersections, function(int) {
    // If the path intersection is out of bounds...
    if (int.point.x < g.view.bounds.left || int.point.x > g.view.bounds.right ||
        int.point.y < g.view.bounds.top || int.point.y > g.view.bounds.bottom) {

      // ...and only if the line intersects the boundary of the view:
      // Pick the closest boundary point add it as the incoming point.
      if (canvasBoundInts.length) {
        outPoints.push(
          canvasBoundInts[
            g.getClosestIntersectionID(int.point, canvasBoundInts)
          ]
        );
      } else { // jshint ignore:line
        // This point is part of a line that doesn't intersect the view bounds,
        // and is outside the view bounds, therefore it is not visible.
        // Do not add it to the output set of points.
      }

      /* Though somewhat counterintuitive, this can definitely happen:
       * Given a shape that extends "far" beyond a corner or side of the view,
       * the intersection fill line never touches the canvas boundary on that
       * fill iteration, even if it properly intersects the shape.
       *
       *        / < Fill line
       *  ____/_________
       * |  / _ _ _ _ _|_ _ _ _
       * |/  | ^(0,0)  | ^ View bounds
       * |__ |_________|
       *     |
       *     |
      **/
    } else {
      outPoints.push(int);
    }
  });

  canvasBounds.remove();
  return outPoints;
}

// Run everything needed to complete dynamic line fill for a given path.
function finishFillPath(fillPath) {
  cFillIndex = 0;
  cSubIndex = 0;
  cStep = 0;
  lines = [];

  // For hatch, we just go run again and skip deletion.
  if (g.settings.hatch === true) {
    // Start the second (last) hatch fill on the same fillpath by not
    // deleting it.
    if (!fillPath.data.lastHatch) {
      fillPath.data.lastHatch = true;
      g.settings.angle+= 90;
      return;
    }

    // If we're at this point, the fill path is done and we can just let it
    // continue normally.
  }

  g.state.totalSteps++;
  if (g.state.currentTraceChild !== g.state.traceChildrenMax) {
    g.state.currentTraceChild++;
  }

  if (g.mode) {
    g.mode.run('status',
      i18n.t('libs.spool.fill', {
        id: g.state.currentTraceChild + '/' + g.state.traceChildrenMax
      }),
      true
    );
    g.mode.run('progress', g.state.totalSteps);
  }

  fillPath.remove(); // Actually remove the path (not needed anymore)
}
