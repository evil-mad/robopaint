/**
 * @file Holds all RoboPaint automatic painting mode specific code
 */

// Initialize the RoboPaint canvas Paper.js extensions & layer management.
canvas.paperInit(paper);
rpRequire('paper_utils')(paper);
rpRequire('auto_stroke')(paper);
rpRequire('auto_fill')(paper);

// Init defaults & settings
paper.settings.handleSize = 10;


// Reset Everything on non-mainLayer and vars
paper.resetAll = function() {
  // Stop all Fill and trace spooling (if running)
  paper.stroke.shutdown();
  paper.fill.shutdown();

  paper.mainLayer.opacity = 1;

  paper.tempLayer.removeChildren();
  paper.actionLayer.removeChildren();
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

  paper.stroke.setup(function() {
    paper.fill.setup(function(){
      
    });
  });
};


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
