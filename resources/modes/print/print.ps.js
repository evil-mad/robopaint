/**
 * @file Holds all RoboPaint automatic painting mode specific code
 */

// Init defaults & settings
var previewWidth = 10;
var flattenResolution = 15; // Flatten curve value (smaller value = more points)
var lastCenter = view.center;
var runTraceSpooling = false; // Set to true to run items from preview into action
var runFillSpooling = false; // Set to true to run items from preview into action

// Setup layers
paper.settings.handleSize = 10;
paper.mainLayer = project.getActiveLayer(); // SVG is imported to here
paper.tempLayer = new Layer(); // Temporary working layer
paper.actionLayer = new Layer(); // Actual movement paths & preview
paper.overlayLayer = new Layer(); // Overlay elements, like the pen position.

// Overlay layer is ready
paper.drawPoint = new Group({
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

paper.moveDrawPoint = function(pos, duration) {
  pos = new Point(pos.x, pos.y);
  var vector = pos - paper.drawPoint.position;
  if (vector.length) {
    var d = paper.drawPoint.data;
    // If we're already moving, just hurry up and get straight to the dest
    if (d.moving === 2) {
      paper.drawPoint.position = d.dest;
    }

    // Moves through stages: 0 is off, 1 is anim frame init, 2 is moving
    d.moving = 1;
    d.vector = vector;
    d.src = paper.drawPoint.position;
    d.dest = pos;
    d.duration = (duration-40) / 1000; // Passed in MS, needed in S
  }
}

paper.animDrawPoint = function(event) {
  var d = paper.drawPoint.data;
  if (!d.moving) return; // Not moving

  if (d.moving === 1) { // Setup anim end time
    d.endTime = event.time + d.duration;
    d.moving = 2;
    return;
  }

  if (d.moving === 2){ // Actual animated movement based on delta.
    if (event.time > d.endTime) { // Movement is done
      d.moving = 0;
      paper.drawPoint.position = d.dest;
    } else {
      var timeDiff = d.duration - (d.endTime - event.time);
      paper.drawPoint.position = d.src.add(d.vector.divide(d.duration / timeDiff));
    }
  }
}


// Default to writing on this layer
paper.mainLayer.activate();

function onResize() {
  var vector = lastCenter - view.center;

  // Reposition all layers
  _.each(project.layers, function(layer){
    layer.position-= vector;
  });

  lastCenter = view.center;
  view.zoom = $canvas.scale;

  fixOffset();
}

var offsetFixed = false;
function fixOffset(){
  if (!offsetFixed) {
    offsetFixed = true;
    var corner = view.viewToProject(new Point(0,0));
    view.scrollBy(-corner);
    lastCenter = view.center;
  }
}

paper.loadSVG = function(svgData) {
  paper.mainLayer.activate();
  paper.mainLayer.removeChildren();
  paper.tempLayer.removeChildren();
  paper.actionLayer.removeChildren();-

  project.importSVG(svgData, {
    applyMatrix: true,
    expandShapes: true
  });

  // SVG Imports as a group, ungroup it.
  var group = paper.mainLayer.children[0]

  group.parent.addChildren(group.removeChildren());
  group.remove();
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
}

// Loaded complete
paperLoadedInit();

// Render the "action" layer, this is actually what will become the motion path
// send to the bot.
paper.renderMotionPaths = function () {
  paper.mainLayer.opacity = 0.1;
  paper.tempLayer.opacity = 0.3;

  prepTracePreview();

  view.update();

  // Paths are rendered to the action Layer
  paper.actionLayer.activate();
  runTraceSpooling = true;
};

// Copy the needed parts for tracing (all paths with strokes) and their fills
var traceChildrenMax = 0;
var currentTraceChild = 1;
function prepTracePreview() {
  var tmp = paper.tempLayer;
  tmp.activate();
  tmp.removeChildren(); // Clear it out

  // Move through all child items in the mainLayer and copy them into temp
  _.each(paper.mainLayer.children, function(path){
    path.copyTo(tmp);
  });

  // Ungroup all groups copied
  ungroupAllGroups(tmp);

  // Move through each temp item to prep them
  var maxLen = 0;
  _.each(tmp.children, function(path){
    maxLen += path.length;
    path.strokeColor = (path.strokeColor && path.strokeWidth) ? snapColor(path.strokeColor) : snapColor(path.fillColor);
    path.data.color = snapColorID(path.strokeColor, path.opacity);
    path.data.name = path.name;
    path.fillColor = path.fillColor ? snapColor(path.fillColor) : null;
    path.strokeWidth = previewWidth;
    if (!path.closed) path.closed = path.fillColor !== null;
  });

  console.log(maxLen);

  // Keep the user up to date with what's going on.
  mode.run([
    ['status', i18n.t('libs.spool.stroke'), true],
    ['progress', 0, maxLen]
  ]);
}

// Copy the needed parts for filling (all paths with fills)
window.prepFill = prepFillPreview;
function prepFillPreview() {
  var tmp = paper.tempLayer;
  tmp.activate();
  tmp.removeChildren(); // Clear it out

    // Move through all child items in the mainLayer and copy them into temp
  _.each(paper.mainLayer.children, function(path){
    path.copyTo(tmp);
  });

  // Ungroup all groups copied
  ungroupAllGroups(tmp);

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

// Ungroup any groups recursively
function ungroupAllGroups(layer) {
  // Remove all groups
  while(layerContainsGroups(layer)) {
    for(var i in layer.children) {
      var path = layer.children[i];
      if (path instanceof paper.Group) {
        path.parent.insertChildren(0, path.removeChildren());
        path.remove();
      }
    }
  }
}

// Snap the given color to the nearest tool ID
// TODO: When refactoring media sets, pull tool names from definition.
window.snapColor = snapColor;
function snapColorID (color, opacity) {
  if (typeof opacity !== 'undefined' & opacity < 1) {
    return 'water2';
  }

  return "color" + robopaint.utils.closestColor(color.toCSS(), robopaint.media.currentSet.colors);
}

// Get the actual color of the nearest color to the one given.
function snapColor (color) {
  return robopaint.media.currentSet.colors[snapColorID(color).substr(-1)].color.HEX;
}

// Return true if the layer contains any groups at the top level
function layerContainsGroups(layer) {
  for(var i in layer.children) {
    if (layer.children[i] instanceof paper.Group) return true;
  }
  return false;
}

// Animation frame callback
function onFrame(event) {
  paper.animDrawPoint(event);
  for(var i = 0; i < 2; i++) {

  if (runTraceSpooling) {
    if (!traceStrokeNext()) { // Check for trace complete
      runTraceSpooling = false;
      prepFillPreview();
      runFillSpooling = true;
      paper.actionLayer.activate();
      tpIndex = 0;
    }
  }

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



var tracePaths = [];
var tpIndex = 0; // Current tracePath
var cPathPos = 0; // Position on current tracing path
var lastGood = false; // Keep track if the last hit was good
var lastItem = null;
var totalLength = 0;

// Iterationally process each path to be traced from preview paths
function traceStrokeNext() {
  // 1. Do we have preview paths?
  // 2. Move from bottom paths to top, removing each as we go.
  // 3. Move through
  // 4. Just convert the whole path if it's the last one
  // 5. Profit?!?

  var tmp = paper.tempLayer;
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
      strokeWidth: previewWidth
    });
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
    var h = tmp.hitTest(testPoint);
    if (h.item === cPath) { // We're on the current path! Add a point
      // If we came off a bad part of the path, add the closest intersection
      if (!lastGood && lastItem && getClosestIntersection(cPath, lastItem, testPoint)) {
        tp.add(getClosestIntersection(cPath, lastItem, testPoint));
      }

      tp.add(testPoint);
      lastGood = true;
    } else { // We're obstructed
      if (tp.segments.length) {
        tpIndex++; // Increment only if this path is used
        // If we came off a good part of the path, add the intersection closest
        if (lastGood && getClosestIntersection(cPath, h.item, testPoint)) {
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
    cPathPos+= flattenResolution; // Increment the path position.

    // If we're too far, limit it and it will be the last point added
    if (cPathPos > cPath.length) {
      totalLength+= cPath.length - (cPathPos - flattenResolution);
      cPathPos = cPath.length;
    } else {
      totalLength+= flattenResolution;
    }
    mode.run('progress', totalLength);
  }

  return true;
}

function getClosestIntersection(path1, path2, point) {
  var ints = path1.getIntersections(path2);

  if (!ints.length) return null; // No intersections? huh

  var best = (ints[0].point - point).length;
  var bestPoint = ints[0].point;

  _.each(ints, function(i) {
    var v = i.point - point;
    if (v.length < best) {
      best = v.length;
      bestPoint = i.point;
    }
  });

  return bestPoint;
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
        strokeWidth: 2,
        strokeColor: '#00ff00',
        position: boundPath.getPointAt(pos),
        rotation: options.angle + 90
      });

      // Find destination position on other side of circle
      pos = options.angle + 360;  if (pos > 360) pos -= 360;
      var destination = boundPath.getPointAt(pos * amt);

      // Find vector and vector length divided by line spacing to get # iterations.
      var vector = destination - line.position;
      var iterations = parseInt(vector.length / options.spacing);
      line.position+= (vector / iterations) * cFillIndex; // Move the line

      // Move through calculated iterations for given spacing
      var ints = line.getIntersections(p);

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
      console.log('Grouping...');
      // Combine lines within position similarity groupings
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
          console.log('Tossed!');
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
          cFillIndex = 0;
          cSubIndex = 0;
          lines = [];

          totalSteps++;
          mode.run('progress', totalSteps);

          if (currentTraceChild !== traceChildrenMax) currentTraceChild++;
          mode.run('status', i18n.t('libs.spool.fill', {id: currentTraceChild + '/' + traceChildrenMax}), true);

          cStep = 0;

          fillPath.remove(); // Actually remove the path (not needed anymore)
          return false;
        }
      }
  }

  mode.run('progress', totalSteps);
  return true;
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

  var vector = -1;
  var bestVector = newGroupThresh;
  var groupID = 0;
  for (var i = 0; i < lines.length; i++) {
    vector = lines[i][lines[i].length-1].firstSegment.point - testPoint;

    if (vector.length < bestVector) {
      groupID = i;
      bestVector = vector.length;
    }
  }

  // Check if we went over the threshold, make a new group!
  if (bestVector === newGroupThresh) {
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

  var pathNum = 0;
  var lastPath = '';
  _.each(layer.children, function(path){
    if (path.data.name != lastPath) {
      pathNum++;
    }
  });

  // Send out the initialization status message.
  run('status', i18n.t('common.libs.autoinit', {
    pathNum: pathNum,
    jobsNum: layer.children.length
  }));

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

    run('status', i18n.t('libs.auto' + typeKey, {id: path.data.name}))
    paper.runPath(path);
  });

  // Wrap up
  run([
    ['wash']
    ['park'],
    ['status', i18n.t('libs.autocomplete')],
    ['callbackname', 'autoPaintComplete']
  ]);
};
