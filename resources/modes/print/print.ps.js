/**
 * @file Holds all RoboPaint automatic painting mode specific code
 */

// Initialize the RoboPaint canvas Paper.js extensions & layer management.
canvas.paperInit(paper);
rpRequire('paper_utils')(paper);
rpRequire('auto_stroke')(paper);

// Init defaults & settings
var runFillSpooling = false; // Set to true to run items from preview into action

paper.settings.handleSize = 10;


// Reset Everything on non-mainLayer and vars
paper.resetAll = function() {
  // Stop all Fill and trace spooling (if running)

  runFillSpooling = false;

  paper.mainLayer.opacity = 1;

  paper.tempLayer.removeChildren();
  paper.actionLayer.removeChildren();

  // Fill & Stroke states
  // TODO: There's got to be a better way to manage these.
  traceChildrenMax = 0;
  currentTraceChild = 1;
  tracePaths = [];
  tpIndex = 0;
  cPathPos = 0;
  lastGood = false;
  lastItem = null;
  totalLength = 0;
  cFillIndex = 0;
  cSubIndex = 0;
  cStep = 0;
  cGroup = null;
  lines = [];
  totalSteps = 0;
}

// Animation frame callback
function onFrame(event) {
  canvas.onFrame(event);
  paper.stroke.onFrameStep();
  paper.fill.onFrameStep();
}

// Show preview paths
function onMouseMove(event)  {
  project.deselectAll();

  if (event.item) {
    event.item.selected = true;
  }
}

function onMouseDown(event)  {
  if (event.item && event.item.parent === paper.actionLayer) {
    paper.runPath(event.item);
  }

  // Delete specific items for debugging
  if (event.item) {
    if (event.item.children) {
      ungroupAllGroups(paper.mainLayer);
    } else {
      event.item.remove();
    }
  }

}

// Render the "action" layer, this is actually what will become the motion path
// send to the bot.
paper.renderMotionPaths = function () {
  paper.canvas.mainLayer.opacity = 0.1;
  paper.canvas.tempLayer.opacity = 0.3;

  paper.stroke.setup();
  paper.stroke.complete = function() {
    //paper.fill.
    console.log('done!');
  };
};


// Copy the needed parts for filling (all paths with fills)
function prepFillPreview() {
  var tmp = paper.tempLayer;
  tmp.activate();
  tmp.removeChildren(); // Clear it out

    // Move through all child items in the mainLayer and copy them into temp
  _.each(paper.mainLayer.children, function(path){
    path.copyTo(tmp);
  });

  // Ungroup all groups copied
  paper.utils.ungroupAllGroups(tmp);

  // Filter out non-fill paths, and ensure paths are closed.
  for(var i in tmp.children) {
    var path = tmp.children[i];
    if (!path.fillColor) {
      path.remove();
    } else {
      path.closed = true;
      path.data.color = snapColorID(path.fillColor, path.opacity);
      path.data.name = path.name;
      path.fillColor = snapColor(path.fillColor);
      path.strokeWidth = 0;
      path.strokeColor = null;
    }
  }

  // Subtract each layer from the previous, again and again.
  // Move through each preview layer child
  for (var srcIndex = 0; srcIndex < tmp.children.length; srcIndex++) {
    var srcPath = tmp.children[srcIndex];
    srcPath.data.processed = true;

    // Replace this path with a subtract for every intersecting path, starting
    // at the current index (lower paths don't subtract from higher ones)
    for (var destIndex = srcIndex; destIndex < tmp.children.length; destIndex++) {
      var destPath = tmp.children[destIndex];
      if (destIndex !== srcIndex) {
        var tmpPath = srcPath; // Hold onto the original path
        // Set the new srcPath to the subtracted one inserted at the same index
        srcPath = tmp.insertChild(srcIndex, srcPath.subtract(destPath));
        srcPath.data.color = tmpPath.data.color;
        srcPath.data.name = tmpPath.data.name;
        tmpPath.remove(); // Remove the old srcPath
      }
    }
  }

  // Keep the user up to date
  traceChildrenMax = tmp.children.length;
  currentTraceChild = 1;
  mode.run([
    ['status', i18n.t('libs.spool.fill', {id: '1/' + traceChildrenMax}), true],
    ['progress', 0, traceChildrenMax * 2] // 2 steps for fill: lines & groups
  ]);
}


paper.fill = {
  onFrameStep: function() {
    // TODO: implement trace interation speed X
    for(var i = 0; i < 2; i++) {
      if (runFillSpooling) { // Are we doing fills?
        // We always fill item 0 on the bottom, as we delete paths when done.
        if (!traceFillNext(paper.tempLayer.children[0],{
          angle: -155,
          spacing: 13,
          threshold: 40
        })){
          // We're done if there are no more paths in the preview layer!
          if (!paper.tempLayer.children.length) {
            runFillSpooling = false;
            if (_.isFunction(paper.renderMotionComplete)) paper.renderMotionComplete();
          }
        };
      }
    }
  }
}


var cFillIndex = 0; // Keep track of which line we're working on
var cSubIndex = 0; // Keep track of which sub we're working on
var cStep = 0; // Which fill step are we on?
var cGroup; // The current line grouping
var lines = [];
var totalSteps = 0; // Keep track of total step changes for user.
function traceFillNext(fillPath, options) {
  // 1. Assume line is ALWAYS bigger than the entire object
  // 2. If filled path, number of intersections will ALWAYS be multiple of 2
  // 3. Grouping pairs will always yield complete line intersections.

  if (!fillPath) return false;

  // Ignore white paths (color id 8)
  // TODO: This should probably be handled depending on number of colors in the
  // media (you can have more pens than 8), paper color might not be white.
  if (fillPath.data.color === 'color8') {
    fillPath.remove(); return true;
  }

  // Ignore 0 width/height fill paths.
  if (fillPath.bounds.width === 0 || fillPath.bounds.height === 0) {
    fillPath.remove(); return true;
  }

  var p = fillPath;

  // Choose the iteration fill step
  switch (cStep) {
    case 0: // Adding initial fill lines
      // Init boundpath and traversal line
      // The path drawn around the object the line traverses
      var boundPath = new Path.Ellipse({
        center: p.position,
        size: [p.bounds.width * 2 , p.bounds.height * 2]
      });

      // Set start & destination based on input angle
      // Divide the length of the bound ellipse into 1 part per angle
      var amt = boundPath.length/360;

      // Set source position to calculate iterations and create destination vector
      var pos = amt * (options.angle + 180);

      // The actual line used to find the intersections
      // Ensure line is far longer than the diagonal of the object
      var line = new Path({
        segments: [new Point(0, 0), new Point(p.bounds.width + p.bounds.height, 0)],
        position: boundPath.getPointAt(pos),
        rotation: options.angle + 90
      });

      // Find destination position on other side of circle
      pos = options.angle + 360;  if (pos > 360) pos -= 360;
      var destination = boundPath.getPointAt(pos * amt);

      // Find vector and vector length divided by line spacing to get # iterations.
      var vector = destination.subtract(line.position);
      var iterations = parseInt(vector.length / options.spacing);
      line.position = line.position.add(vector.divide(iterations).multiply(cFillIndex)); // Move the line

      // Move through calculated iterations for given spacing
      var ints = checkBoundaryIntersections(line, line.getIntersections(p));

      if (ints.length % 2 === 0) { // If not dividable by 2, we don't want it!
        for (var x = 0; x < ints.length; x+=2) {

          var groupingID = findLineFillGroup(ints[x].point, lines, options.threshold);

          var y = new Path({
            segments: [ints[x].point, ints[x+1].point],
            strokeColor: p.fillColor, // Will become fill color
            data: {color: p.data.color, name: p.data.name, type: 'fill'},
            strokeWidth: 5,
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
        totalSteps++;
      }

      // Clean up our helper paths
      line.remove();
      boundPath.remove();

      break;
    case 1: // Grouping and re-grouping the lines
      // Combine lines within position similarity groupings

      // If there are none, then the first step didn't ever actually touch the
      // shape. Must be pretty small! Finish up early.
      if (!lines[0]) {
        finishFillPath(fillPath);
        return false;
      }

      if (cSubIndex === 0) {
        if (!lines[cFillIndex]) {
          console.log(cFillIndex)
        }
        cGroup = lines[cFillIndex][0];
        cSubIndex = 1;
      }

      if (typeof lines[cFillIndex][cSubIndex] !== 'undefined') {
        // Don't join lines that cross outside the path
        var v = new Path({
          segments: [cGroup.lastSegment.point, lines[cFillIndex][cSubIndex].firstSegment.point]
        });

        //console.log('ints', v.getIntersections(p).length);

        // Find a point halfway between where these lines would be connected
        // If it's not within the path, don't do it!
        // TODO: This only removes the bad outliers, may need improvement!
        if (!p.contains(v.getPointAt(v.length/2)) || v.getIntersections(p).length > 3) {
          // Not contained, store the previous l & start a new grouping;
          cGroup = lines[cFillIndex][cSubIndex];
          //console.log('Tossed!');
        } else {
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
          return false;
        }
      }
  }

  mode.run('progress', totalSteps);
  return true;
}

// If any given intersections that are outside the view bounds, move them to the
// nearest view boundary intersection
function checkBoundaryIntersections(line, intersections) {
  // Init canvas boundary line to intersect if beyond the printable area.
  var canvasBounds = new Path.Rectangle({
    from: [0, 0],
    to: [view.bounds.width, view.bounds.height]
  });

  var outPoints = [];

  var canvasBoundInts = line.getIntersections(canvasBounds);
  _.each(intersections, function(int) {
    // If the path intersection is out of bounds...
    if (int.point.x < 0 || int.point.x > view.bounds.width ||
        int.point.y < 0 || int.point.y > view.bounds.height) {

      // ...and only if the line intersects the boundary of the view:
      // Pick the closest boundary point add it as the incoming point.
      if (canvasBoundInts.length) {
        outPoints.push(canvasBoundInts[getClosestIntersectionID(int.point, canvasBoundInts)]);
      } else {
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

function finishFillPath(fillPath) {
  cFillIndex = 0;
  cSubIndex = 0;
  lines = [];

  totalSteps++;
  mode.run('progress', totalSteps);

  if (currentTraceChild !== traceChildrenMax) currentTraceChild++;
  mode.run('status', i18n.t('libs.spool.fill', {id: currentTraceChild + '/' + traceChildrenMax}), true);

  cStep = 0;

  fillPath.remove(); // Actually remove the path (not needed anymore)
}

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
    var dist = lines[i][lines[i].length-1].firstSegment.point.getDistance(testPoint);

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



// Order a layers children by top left travel path from tip to tail, reversing
// path order where needed, grouped by job/color.
paper.travelSortLayer = function(layer) {
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
    var lastPoint = new Point(0, 0); // The last point to move from, start at the corner

    while(group.length) {
      var c = closestPointInGroup(lastPoint, group);

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

      // Insert the path to the next spot in the action layer.
      a.insertChild(drawIndex, group[c.id].path);
      group.splice(c.id, 1); // Remove it from the list of paths

      drawIndex++;
    }
  });

}

// Find the closest point to a given source point from an array of point groups.
function closestPointInGroup(srcPoint, pathGroup) {
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
}



// Run an open linear segmented non-compound tracing path into the buffer
paper.runPath = function(path) {
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
}

// Actually handle a fully setup action layer to be streamed into the buffer
// in the path and segment order they're meant to be streamed.
paper.autoPaint = function(layer) {
  paper.travelSortLayer(layer);
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
    paper.runPath(path);
  });

  // Wrap up
  run([
    'wash',
    'park',
    ['status', i18n.t('libs.autocomplete')],
    ['callbackname', 'autoPaintComplete']
  ]);
};
