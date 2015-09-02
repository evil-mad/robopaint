/**
 * @file Holds all RoboPaint automatic painting mode specific code
 */

// Init defaults & settings
var previewWidth = 10;
var flattenResolution = 30; // Flatten curve value (smaller value = more points)
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
  ],
  /*strokeColor: 'black',
  strokeWidth: 3,*/
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

    //paper.drawPoint.data.vectorAdd = (vector / 60) * (duration / 1000);
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

// Run a path into the buffer (Open linear segmented non-compound paths only!)
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
  mode.run('up');
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
  prepTracePreview();

  view.update();

  // Paths are rendered to the action Layer
  paper.actionLayer.activate();
  runTraceSpooling = true;
};

// Copy the needed parts for tracing (all paths with strokes) and their fills
function prepTracePreview() {
  var tmp = paper.tempLayer;
  tmp.activate();
  tmp.removeChildren(); // Clear it out

  // Move through all child items in the mainLayer and copy them into preview
  _.each(paper.mainLayer.children, function(path){
    path.copyTo(tmp);
  });

  // Move through each preview layer child
  _.each(tmp.children, function(path){
    path.fillColor = path.fillColor ? 'red' : null;
    path.strokeWidth = previewWidth;
    path.strokeColor = '#0000FF';
  });
}

// Copy the needed parts for filling (all paths with fills)
window.prepFill = prepFillPreview;
function prepFillPreview() {
  var tmp = paper.tempLayer;
  tmp.activate();
  tmp.removeChildren(); // Clear it out

    // Move through all child items in the mainLayer and copy them into temp
  _.each(paper.mainLayer.children, function(path){
    if (path.fillColor) path.copyTo(tmp);
  });


  // Subtract each layer from the previous, again and again.
  // Move through each preview layer child
  for (var srcIndex = 0; srcIndex < tmp.children.length; srcIndex++) {
    var srcPath = tmp.children[srcIndex];
    srcPath.strokeWidth = 0;
    srcPath.strokeColor = null;

    // Replace this path with a subtract for every intersecting path, starting
    // at the current index (lower paths don't subtract from higher ones)
    for (var destIndex = srcIndex; destIndex < tmp.children.length; destIndex++) {
      var destPath = tmp.children[destIndex];
      if (destIndex !== srcIndex && srcPath.getIntersections(destPath).length) {
        var tmpPath = srcPath; // Hold onto the original path
        // Set the new srcPath to the subtracted one inserted at the same index
        srcPath = tmp.insertChild(srcIndex, srcPath.subtract(destPath));
        tmpPath.remove(); // Remove the old srcPath
      }
    }
  }
}


// Animation frame callback
function onFrame(event) {
  paper.animDrawPoint(event);

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







var tracePaths = [];
var tpIndex = 0; // Current tracePath
var cPathPos = 0; // Position on current tracing path
var lastGood = false; // Keep track if the last hit was good
var lastItem = null;

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
  //cPath.selected=true;

  // Current trace path doesn't exist? Make it!
  if (!tracePaths[tpIndex]) {
    tracePaths[tpIndex] = new Path({
      strokeColor: '#00FF00',
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
    console.log('Path done!', cPathPos);
    cPath.remove();
    lastGood = false;
    lastItem = null;
    cPathPos = 0;
    if (tp.segments.length) tpIndex++; // Increment only if this path is used
  } else { // Next part of the path
    cPathPos+= flattenResolution; // Increment the path position.

    // If we're too far, limit it and it will be the last point added
    if (cPathPos > cPath.length) cPathPos = cPath.length;
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
function traceFillNext(fillPath, options) {
  // 1. Assume line is ALWAYS bigger than the entire object
  // 2. If filled path, number of intersections will ALWAYS be multiple of 2
  // 3. Grouping pairs will always yield complete line intersections.

  if (!fillPath) return false;

  var p = fillPath;

  // Choose the iteration fill step
  switch (cStep) {
    case 0: // Adding initial fill lines
      // Init boundpath and traversal line
      // The path drawn around the object the line traverses
      var boundPath = new Path.Ellipse({
        center: p.position,
        size: [p.bounds.width + p.bounds.width/Math.PI , p.bounds.height + p.bounds.height/Math.PI]
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
            strokeColor: 'red', // Will become fill color
            strokeWidth: 4,
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

          console.log('Path Done!');
          cStep = 0;

          fillPath.remove(); // Actually remove the path (not needed anymore)
          return false;
        }
      }
  }

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

// When the motion paths have been rendered... sort them!
paper.renderMotionComplete = function() {
  var a = paper.actionLayer;

}

paper.autoPaint = function(callback) {
   // Clear all selections
  $('path.selected', context).removeClass('selected');

  // Make sure the colors are ready
  robopaint.utils.autoColor(context, false, cncserver.config.colors);

  // Holds all jobs keyed by color
  var jobs = {};
  var c = cncserver.config.colors;
  var colorMatch = robopaint.utils.closestColor;
  var convert = robopaint.utils.colorStringToArray;

  $('path', context).each(function(){
    var $p = $(this);
    var stroke = convert($p.css('stroke'));
    var fill = convert($p.css('fill'));

    // Occasionally, these come back undefined
    stroke = (stroke == null) ? false : 'color' + colorMatch(stroke, c);
    fill = (fill == null) ? false : 'color' + colorMatch(fill, c);

    // Account for fill/stroke opacity (paint with clean water2!)
    // TODO: What do we do here for the EggBot? Likely skip, or ignore....
    var op = Math.min($p.css('fill-opacity'), $p.css('opacity'));
    if (typeof op != 'undefined') fill = (op < 1) ? 'water2' : fill;

    op = Math.min($p.css('stroke-opacity'), $p.css('opacity'));
    if (typeof op != 'undefined') stroke = (op < 1) ? 'water2' : stroke;

    // Don't actually fill or stroke for white... (color8)
    if (fill == 'color8') fill = false;
    if (stroke == 'color8') stroke = false;

    // Add fill (and fill specific stroke) for path
    if (fill) {
      // Initialize the color job object as an array
      if (typeof jobs[fill] == 'undefined') jobs[fill] = [];

      // Give all non-stroked filled paths a stroke of the same color first
      if (!stroke) {
        jobs[fill].push({t: 'stroke', p: $p});
      }

      // Add fill job
      jobs[fill].push({t: 'fill', p: $p});
    }

    // Add stroke for path
    if (stroke) {
      // Initialize the color job object as an array
      if (typeof jobs[stroke] == 'undefined') jobs[stroke] = [];

      jobs[stroke].push({t: 'stroke', p: $p});
    }
  });

  var sortedColors = cncserver.wcb.sortedColors();

  var finalJobs = [];

  $.each(sortedColors, function(i, c){
    if (typeof jobs[c] != 'undefined'){
      var topPos = finalJobs.length;
      for(j in jobs[c]){
        var out = {
          c: c,
          t: jobs[c][j].t,
          p: jobs[c][j].p
        };

        // Place strokes ahead of fills, but retain color order
        if (out.t == 'stroke') {
          finalJobs.splice(topPos, 0, out);
        } else {
          finalJobs.push(out);
        }

      }
    }
  });

  // Send out the initialization status message.
  cncserver.status(robopaint.t('libs.autoinit', {
    pathNum: $('path', context).length,
    jobsNum: finalJobs.length
  }));

  // Nothing manages color during automated runs, so you have to hang on to it.
  // Though we don't actually give it a default value, this ensures we get a
  // full wash before every auto-paint initialization
  var runColor;

  var jobIndex = 0;
  doNextJob();

  function doNextJob() {
    var job = finalJobs[jobIndex];
    var run = cncserver.cmd.run;

    if (job) {
      // Make sure the color matches, full wash and switch colors!
      if (runColor != job.c) {
        run(['wash', ['media', job.c]]);
        runColor = job.c;
        cncserver.cmd.sendComplete(readyStartJob);
      } else {
        readyStartJob();
      }

      function readyStartJob() {
        // Clear all selections at start
        $('path.selected', context).removeClass('selected');
        robopaint.utils.addShortcuts(job.p);

        if (job.t == 'stroke'){
          job.p.addClass('selected');
          run('status', robopaint.t('libs.autostroke', {id: job.p[0].id}));
          cncserver.paths.runOutline(job.p, function(){
            jobIndex++;
            job.p.removeClass('selected'); // Deselect now that we're done
            cncserver.cmd.sendComplete(doNextJob);
          })
        } else if (job.t == 'fill') {
          run('status', robopaint.t('libs.autofill', {id: job.p[0].id}));

          cncserver.paths.runFill(job.p, function(){
            jobIndex++;
            cncserver.cmd.sendComplete(doNextJob);
          });
        }
      }
    } else {
      run('wash');
      cncserver.cmd.sendComplete(function(){
        run([
          'park',
          ['status', robopaint.t('libs.autocomplete')],
          ['callbackname', 'autopaintcomplete']
        ]);
      });
      if (callback) callback();
      // Done!
    }
  }
};
