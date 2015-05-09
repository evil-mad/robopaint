/**
 * @file Holds all CNC Server path management and tracing functions
 */

define(function(){return function($, robopaint, cncserver){
cncserver.paths = {
  // Find out what DOM object is directly below the point given
  // Will NOT work if point is outside visible screen range!

  // TODO: maybe this can be replaced by polygonal collision detection? :P
  // Wait, no, on second thought this is a terrible idea. We should just
  // boolean difference all the paths into each other!
  // https://github.com/Delapouite/JsClipper
  getPointPathCollide: function(point) {

    // Add 48 to each side for 96dpi 1/2in offset
    var x = ((point.x+48) * cncserver.canvas.scale) + cncserver.canvas.offset.left;
    var y = ((point.y+48) * cncserver.canvas.scale) + cncserver.canvas.offset.top;

    // Debug for positioning canvas offset (damn tricky without this)
    if (cncserver.config.canvasDebug) {
      var ctx = $('canvas#debug')[0].getContext("2d");
      ctx.strokeStyle = "rgba(255, 0, 0, 0.8)";
      ctx.lineWidth = 2;
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    return document.elementFromPoint(x, y);
  },

  // Convert all document svg elements capable into paths!
  // Adapted from svgcanvas in svg-edit main
  changeToPaths: function(context) {
    $('*:not(path,svg,g,title,metadata)', context).each(function(){
      var elem = this;
      var $elem = $(this);

      // Pass over attributes to new path element

      if (!elem.ownerSVGElement) {
        // Delete non-supported SVG elements
        elem.parentNode.removeChild(elem);
        return;
      }

      var svgNS = elem.ownerSVGElement.namespaceURI;
      var path = document.createElementNS(svgNS, 'path');

      $(path).attr({
        fill: $elem.attr('fill') == 'rgba(0, 0, 0, 0)' ? 'none' : $elem.attr('fill'),
        stroke: $elem.attr('stroke') == 'rgba(0, 0, 0, 0)' ? 'none' : $elem.attr('stroke'),
        'stroke-width': parseInt($elem.attr('stroke-width')) == 0 ? 10 : parseInt($elem.attr('stroke-width')),
        id: $elem.attr('id')
      })[0];

      if ($elem.attr('transform')){
        $(path).attr('transform', $elem.attr('transform'));
      }

      var d = '';

      var joinSegs = function(segs) {
        $.each(segs, function(j, seg) {
          var l = seg[0], pts = seg[1];
          d += l;
          for(var i=0; i < pts.length; i+=2) {
            d += (pts[i] +','+pts[i+1]) + ' ';
          }
        });
      }

      // Possibly the cubed root of 6, but 1.81 works best
      var num = 1.81;

      switch (elem.tagName) {
      case 'ellipse':
      case 'circle':
        var cx = $elem.attr('cx');
        var cy = $elem.attr('cy');
        var rx = $elem.attr('rx');
        var ry = $elem.attr('ry');

        if(elem.tagName == 'circle') {
          rx = ry = $elem.attr('r');
        }

        joinSegs([
          ['M',[(cx-rx),(cy)]],
          ['C',[(cx-rx),(cy-ry/num), (cx-rx/num),(cy-ry), (cx),(cy-ry)]],
          ['C',[(cx+rx/num),(cy-ry), (cx+rx),(cy-ry/num), (cx+rx),(cy)]],
          ['C',[(cx+rx),(cy+ry/num), (cx+rx/num),(cy+ry), (cx),(cy+ry)]],
          ['C',[(cx-rx/num),(cy+ry), (cx-rx),(cy+ry/num), (cx-rx),(cy)]],
          ['Z',[]]
        ]);
        break;
      case 'line':
        d = "M"+$(elem).attr('x1')+","+$(elem).attr('y1')+"L"+$(elem).attr('x2')+","+$(elem).attr('y2');
        break;
      case 'polyline':
      case 'polygon':
        d = "M" + $elem.attr('points');
        break;
      case 'rect':
        var rx = $elem.attr('rx');
        var ry = $elem.attr('ry');
        var b = elem.getBBox();
        var x = b.x, y = b.y, w = b.width, h = b.height;
        num = 4-num; // Why? Because!

        if(!rx && !ry) {
          // Regular rect
          joinSegs([
            ['M',[x, y]],
            ['L',[x+w, y]],
            ['L',[x+w, y+h]],
            ['L',[x, y+h]],
            ['L',[x, y]],
            ['Z',[]]
          ]);
        } else {
          joinSegs([
            ['M',[x, y+ry]],
            ['C',[x,y+ry/num, x+rx/num,y, x+rx,y]],
            ['L',[x+w-rx, y]],
            ['C',[x+w-rx/num,y, x+w,y+ry/num, x+w,y+ry]],
            ['L',[x+w, y+h-ry]],
            ['C',[x+w, y+h-ry/num, x+w-rx/num,y+h, x+w-rx,y+h]],
            ['L',[x+rx, y+h]],
            ['C',[x+rx/num, y+h, x,y+h-ry/num, x,y+h-ry]],
            ['L',[x, y+ry]],
            ['Z',[]]
          ]);
        }
        break;
      default:
        // Delete non-supported SVG elements
        elem.parentNode.removeChild(elem);
        return;
      }

      if(d) {
        path.setAttribute('d',d);
      }

      // Replace the current element with the converted one
      elem.parentNode.replaceChild(path, elem);
    });
  },

 /**
   *  Helper function to run the outline of a linear path into the buffer.
   *  Takes over path running when occlusions aren't an issue and the path
   *  only contains M and L type segments.
   *
   *  @param {SVGpath object} path
   *    DOM object for the path
   *  @returns {boolean}
   *    True on success, false on failure
   */
  _runLinearOutline: function(path) {
    if (!robopaint.utils.pathIsLinear(path)) return false;
    var run = cncserver.cmd.run;
    var lastPoint = {x: 0, y: 0};

    if (!path.transformMatrix) {
      path.transformMatrix = path.getTransformToElement(path.ownerSVGElement);
      path.transPoint = function(point){ // Handy helper function for gPAL
        var svgPoint = this.ownerSVGElement.createSVGPoint();
        svgPoint.x = point.x; svgPoint.y = point.y;
        svgPoint = svgPoint.matrixTransform(this.transformMatrix);
        return {x: svgPoint.x + 48, y: svgPoint.y + 48};
      };
    }

    // Move through each segment
    for (var i = 0; i < path.pathSegList.numberOfItems; i++) {
      var seg = path.pathSegList.getItem(i);
      var letter = seg.pathSegTypeAsLetter;

      var point = {x: seg.x, y: seg.y};

      if (letter == 'm' || letter == 'l') { // Relative point offset (convert to ABS)
        point.x = lastPoint.x + point.x;
        point.y = lastPoint.y + point.y;
        letter = letter.toUpperCase(); // We're all friends now :)
      }

      lastPoint.x = point.x; lastPoint.y = point.y;

      point = path.transPoint(point);

      // TODO: Add overshoot at end movements
      // Code can probably be copied from runOutline below using lastPoint, etc
      if (letter == 'M') { // Move to pos
        run('up');
        run('move', {x: point.x, y: point.y});
        run('down');

      } else if (letter == 'L' || letter == 'l') { // Draw Line
        run('move', {x: point.x, y: point.y});
      }

    }

    return true;
  },

  /**
   *  Run a the outline of a given path into the buffer
   *
   *  @param {object} $path
   *    The jQuery object for the path to be filled
   *  @param {function} callback
   *    Callback function for when the run completes
   *  @param {object} options
   *    The JSON set of options
   *    * strokeovershoot: amount to move the brush when about to lift
   *
   */
  runOutline: function($path, callback, options) {
    var run = cncserver.cmd.run;

    // Default options object to a copy of the full global settings object
    if (typeof options === 'undefined') options = jQuery.extend({}, robopaint.settings);

    // Hide sim window
    $('#sim').hide();

    // Start with brush up
    run('up');

    // If we don't care about occlusions, and it's linear, run it the "easy" way!
    if (cncserver.config.checkVisibility === false && robopaint.utils.pathIsLinear($path[0])) {
      if (cncserver.paths._runLinearOutline($path[0])) {
        run('up');
        console.info($path[0].id + ' linear path outline run done!');
        if (callback) callback();
        return;
      }
    }

    // We can think of the very first brush down as waiting till we should paint
    cncserver.state.process.waiting = true;

    var distance = 0;
    var lastPoint = {};
    var p = {};
    var drawAngle = 0;
    var lastPathSeg = -1; // Assume change on first subpath
    var overshootMultiplier = 4.5;
    var cPathSeg = 0;
    var subPathCount = 0;

    runNextPoint();

    function runNextPoint() {
      lastPoint = {x:p.x, y:p.y}; // Store the last run point

      if (distance <= $path.maxLength) {

        p = $path.getPoint(distance); // Get a new point
        drawAngle = Math.atan2(p.x - lastPoint.x, lastPoint.y - p.y);
        cPathSeg = $path[0].getPathSegAtLength(distance); // Store the current seg ID

        // Increment distance, only after the first check
        // allows for starting at distance 0
        distance+= parseInt(options.strokeprecision);

        // If the path is still visible here
        // Assume as always visible if we're not actually checking
        var isVisible = true;
        if (cncserver.config.checkVisibility) {
          var pathAtPoint = cncserver.paths.getPointPathCollide(p);
          if (pathAtPoint != $path[0]) {
            isVisible = false;
          }
        }
        if (isVisible){

          if (cPathSeg !== lastPathSeg) {
            // If our last segment jumped, check if it's a move to path
            if (cPathSeg > lastPathSeg+1) {
              // Move through all segments from previous, to last
              for(var checkSeg = cPathSeg-1; checkSeg > lastPathSeg; checkSeg--) {
                var seg = $path[0].pathSegList.getItem(checkSeg);
                if (seg.pathSegTypeAsLetter.toLowerCase() === "m") {
                  subPathCount++;
                  if (options.refillmode == 0) {
                      run([
                        ['status', robopaint.t("libs.sub", {num: subPathCount})],
                        'up',
                        ['move', p],
                        'down'
                      ]);
                  } else if (options.refillmode == 1) {
                   run([
                        ['status', robopaint.t("libs.subrefill", {num: subPathCount})],
                        'up',
                        ['getpaintfull', p],
                        ['move', p],
                        'down'
                        ]);

                  }
                  break;
                }
              }
            } else {
              // Next sequential path segment, move to point
              run('move', p);
            }

            lastPathSeg = cPathSeg;
          } else {
            // Same path segment, move to point
            run('move', p);
          }

          // If we were waiting, move to point then pen goes down
          if (cncserver.state.process.waiting) {
            run([
              ['move', p],
              'down'
            ]);
            cncserver.state.process.waiting = false;
          }
        } else { // Path is invisible, lift the brush if we're not already waiting
          if (!cncserver.state.process.waiting) {
            // Figure out how much change since last point, move more before lifting
            if (lastPoint.x && options.strokeovershoot) {
              // Overshoot to make up for brush flexibility
              run('move', {
                x: p.x + (options.strokeovershoot * Math.sin(drawAngle) * overshootMultiplier),
                y: p.y - (options.strokeovershoot * Math.cos(drawAngle) * overshootMultiplier)
              });
            }

            run('up');
            cncserver.state.process.waiting = true;
          }
        }
        process.nextTick(runNextPoint);
      } else { // Done
        // Overshoot to make up for brush flexibility
        if (options.strokeovershoot) {
          run('move', {
            x: p.x + (options.strokeovershoot * Math.sin(drawAngle) * overshootMultiplier),
            y: p.y - (options.strokeovershoot * Math.cos(drawAngle) * overshootMultiplier)
          });
        }


        run('up');
        console.info($path[0].id + ' path outline run done!');
        if (callback) callback();
      }
    }
  },

  /**
   * "Private" function, run a full path fill for a given path into the buffer
   *
   *  @param {object} $path
   *    The jQuery object for the path to be filled
   *  @param {object} options
   *    The JSON set of options:
   *    * filltype: The type of the fill, must resolve to an existing path ID
   *    * fillangle: The angle of the line. 0, 45 or 90
   *    * fillprecision: The number of steps between each path position check
   *    * fillspacing: the amount of space between the lines
   *  @param {function} callback
   *    Callback function for when the runFill completes
   *
   */
  _runPathFill: function($path, options, callback) {
    var run = cncserver.cmd.run;
    var pathRect = $path[0].getBBox();
    var $fill = cncserver.wcb.getFillPath(options);
    var fillType = $fill.attr('id').split('-')[1];

    var center = {
      x: pathRect.x + (pathRect.width / 2) + 48,
      y: pathRect.y + (pathRect.height / 2) + 48
    }

    // Center the fill path
    $fill.attr('transform', 'translate(' + center.x + ',' + center.y + ')');

    $fill.transformMatrix = $fill[0].getTransformToElement($fill[0].ownerSVGElement);
    $fill.getPoint = function(distance){ // Handy helper function for gPAL
      var p = this[0].getPointAtLength(distance).matrixTransform(this.transformMatrix);
      return {x: p.x-48, y: p.y-48};
    };

    var pathPos = 0;
    var p = {};
    var max = $fill[0].getTotalLength();
    runNextFill();

    function runNextFill() {
      pathPos+= parseInt(options.fillprecision);
      p = $fill.getPoint(pathPos);

      // Short circuit for full path trace completion
      if (fillType == 'spiral') {
        // Spiral is outside top left, and therefore can never return
        if (p.x < pathRect.x && p.y < pathRect.y ) pathPos = max;

        // Outside bottom right, and therefore can never return
        if (p.x > pathRect.x + pathRect.width && p.y > pathRect.y + pathRect.height) pathPos = max;
      }

      if (pathPos < max) {
        // If the path is still visible here
        var isVisible = false;

        // Is the point within the bounding box of the path to be filled?
        if ((p.x >= pathRect.x && p.y >= pathRect.y) &&
            (p.x < pathRect.x + pathRect.width && p.y < pathRect.y + pathRect.height)) {
            isVisible = true;
        }

        // Only if we've passed previous checks should we run the expensive
        // getPointPathCollide function
        if (isVisible){
          isVisible = cncserver.paths.getPointPathCollide(p) == $path[0]
        }

        if (isVisible){
          // Move to point!
          run('move', p);
          lastPoint = {x:p.x, y:p.y};

          // If we were waiting, pen goes down
          if (cncserver.state.process.waiting) {
            run('down');
            cncserver.state.process.waiting = false;
          }
        } else { // Path is invisible, lift the brush if we're not already waiting
          if (!cncserver.state.process.waiting) {
            run('move', $fill.getPoint(pathPos+5));
            run('up');
            cncserver.state.process.waiting = true;
          }
        }
        process.nextTick(runNextFill);
      } else { // Done
        if (callback) callback();
      }
    }
  },

  /**
   * "Private" function, run a full line fill for a given path into the buffer
   *
   *  @param {object} $path
   *    The jQuery object for the path to be filled
   *  @param {object} options
   *    The JSON set of options, required set listed:
   *    * filltype: The type of the fill, must resolve to an existing path ID
   *    * fillprecision: The amount of space between each path position check
   *    * fillangle: The angle of the line. 0, 45 or 90
   *    * fillspacing: the amount of space between the lines
   *  @param {function} callback
   *    Callback function for when the runFill completes
   *
   */
  _runLineFill: function($path, options, callback) {
    var run = cncserver.cmd.run;
    var pathRect = $path[0].getBBox();
    var $fill = cncserver.wcb.getFillPath(options);
    var fillType = $fill.attr('id').split('-')[2];
    var isLinear = (fillType == 'straight');

    $fill.transformMatrix = $fill[0].getTransformToElement($fill[0].ownerSVGElement);
    $fill.getPoint = function(distance){ // Handy helper function for gPAL
      var p = this[0].getPointAtLength(distance).matrixTransform(this.transformMatrix);
      return {x: p.x-48, y: p.y-48};
    };

    // Sanity check incoming angle to match supported angles
    if (options.fillangle != 0 && options.fillangle !=90) {
      options.fillangle = options.fillangle == 45 ? -45 : 0;
    }

    options.fillprecision = parseInt(options.fillprecision);

    var linePos = 0;
    var lineIteration = 0;
    var lastPointChecked = {};
    var p = {};
    var max = $fill[0].getTotalLength();
    var goRight = true;
    var gapConnectThreshold = options.fillprecision * 5;
    var done = false;
    var leftOffset = -48;
    var topOffset = 48;
    var bottomLimit = 48;
    var fillOffsetPadding = options.fillprecision;
    var fillCount = 0;

    // Offset calculation for non-flat angles
    // TODO: Support angles other than 45
    if (options.fillangle == -45) {
      var rads = (Math.abs(options.fillangle)/2) * Math.PI / 180
      topOffset = (pathRect.height / 2) + 48;
      leftOffset = (Math.tan(rads) * (pathRect.height * 1.2))-48;

      bottomLimit = Math.tan(rads) * (pathRect.width * 1.2) + 48;
    }

    // Start fill position at path top left (less fill offset padding)
    $fill.attr('transform', 'translate(' + (pathRect.x - fillOffsetPadding - leftOffset) +
      ',' + (pathRect.y - fillOffsetPadding + topOffset) + ') rotate(' + options.fillangle + ')');

    runNextFill();

    function runNextFill() {
      linePos+= options.fillprecision;

      var shortcut = false;

      // Shortcut ending a given line check based on position (45deg) ==========
      if (options.fillangle == -45 && false) {
        // Line has run away up beyond the path
        if (goRight && p.y < pathRect.y - fillOffsetPadding) {
          shortcut = true;
          console.log('line #' + lineIteration + ' up shortcut!');
        }
      }

      // Shortcut ending a given line check based on position (vertical) =======
      if (options.fillangle == 90) {
        // Line has run away down beyond the BBox
        if (goRight && p.y > pathRect.y + pathRect.height) {
          shortcut = true;
        }

        // Line is too far right
        if (p.x > pathRect.x + pathRect.width) {
          shortcut = true;
        }

      }

      // Shortcut ending a given line check based on position (horizontal) =====
      if (options.fillangle == 0) {
        // Line has run away down beyond the BBox
        if (goRight && p.x > pathRect.x + pathRect.width) {
          shortcut = true;
        }

        // Line is beyond the bottom
        if (p.y > pathRect.y + pathRect.height) {
          shortcut = true;
        }
      }


      // If we've used up this line, move on to the next one!
      if (linePos > max || shortcut) {
        lineIteration++; // Next line! Move it to the new position

        var lineSpaceAmt = options.fillspacing * lineIteration;

        // Move down
        var lineSpace = {
          x: 0,
          y: lineSpaceAmt
        }

        // TODO: Support angles other than 45 & 90
        if (options.fillangle == -45) {
          // Move down and right
          lineSpace = {
            x: (options.fillspacing/2) * lineIteration,
            y: (options.fillspacing/2) * lineIteration
          }
        } else if (options.fillangle == 90) {
          // Move right
          lineSpace = {
            x: lineSpaceAmt,
            y: 0
          }
        }

        var fillOrigin = {
          x: pathRect.x + lineSpace.x - fillOffsetPadding - leftOffset,
          y: pathRect.y + lineSpace.y - fillOffsetPadding + topOffset
        };

        if (fillOrigin.y > pathRect.y + pathRect.height + bottomLimit + 24 ||
            fillOrigin.x > pathRect.x + pathRect.width - leftOffset + 24 ) {
          done = true;
        } else {
          // Set new position of fill line, and reset counter
          $fill.attr('transform', 'translate(' + fillOrigin.x + ',' + fillOrigin.y + ') rotate(' + options.fillangle + ')');
          $fill.transformMatrix = $fill[0].getTransformToElement($fill[0].ownerSVGElement);

          linePos = 0;
          goRight = !goRight;
        }
      }

      // Still work to do? Lets go!
      if (!done) {

        // Reverse direction? Simply invert the value!
        var lineGet = goRight ? linePos : max-linePos;

        // Go and get the x,y for the position on the line
        p = $fill.getPoint(lineGet);


        // If the path is still visible here, assume it's not for now
        var isVisible = false;

        // Is the point within the bounding box of the path to be filled?
        if ((p.x >= pathRect.x && p.y >= pathRect.y) &&
            (p.x < pathRect.x + pathRect.width && p.y < pathRect.y + pathRect.height)) {
            isVisible = true;
        }

        // Only if we've passed previous checks should we run the expensive
        // getPointPathCollide function
        if (isVisible){
          isVisible = cncserver.paths.getPointPathCollide(p) == $path[0]
        }

        if (isVisible){ // Path is visible at this position!

          // If we were waiting...
          if (cncserver.state.process.waiting) {
            cncserver.state.process.waiting = false;

            // Find out how far away we are now...
            var diff = robopaint.utils.getDistance(lastPointChecked, p);

            // If we're too far away, lift the pen, then move to the position, then come down
            if (diff > gapConnectThreshold || isNaN(diff)) {
              run('up');
              run('move', p);
              run('down');
            } else { // If we're close enough, just move to the new point
              run('move', p);
            }

          } else { // Still visible, just keep moving
            // Only log the in-between moves if it's non-linear
            if (!isLinear) {
              run('move', p);
            }
          }

        } else { // Path is invisible, lift the brush if we're not already waiting
          if (!cncserver.state.process.waiting) {
            run('move', p);
            cncserver.state.process.waiting = true;

            // Save the point that we looked at to check later.
            lastPointChecked = {x:p.x, y:p.y};
          }
        }
        process.nextTick(runNextFill);
      } else { // DONE!
        // Reset position of fill line (avoids odd prefill lines)
        $fill.attr('transform', 'translate(0,0)');
        if (callback) callback();
      }
    }
  },

  /**
   * "Private" function, run a full TSP fill for a given path into the buffer
   *
   *  @param {object} $path
   *    The jQuery object for the path to be filled
   *  @param {object} options
   *    The JSON set of options
   *    * tsprunnertype: Type of TSP to run, OPT (fast) or ACO (slow)
   *    * fillprecision: sets the spacing between the dots to connect
   *  @param {function} callback
   *    Callback function for when the runFill completes
   *
   */
  _runTSPFill: function($path, options, callback) {
    var run = cncserver.cmd.run;
    var pathRect = $path[0].getBBox();
    var $fill = cncserver.wcb.getFillPath({filltype: 'tsp'});

    var points = []; // Final points to run TSP on

    var center = {
      x: pathRect.x + (pathRect.width / 2) + 48,
      y: pathRect.y + (pathRect.height / 2) + 48
    }

    // Center the fill path
    $fill.attr('transform', 'translate(' + center.x + ',' + center.y + ')');

    $fill.transformMatrix = $fill[0].getTransformToElement($fill[0].ownerSVGElement);
    $fill.getPoint = function(distance){ // Handy helper function for gPAL
      var p = this[0].getPointAtLength(distance).matrixTransform(this.transformMatrix);
      // Add 48 to each side for 96dpi 1/2in offset
      return {x: p.x-48, y: p.y-48};
    };

    var fillCount = 0;
    var p = {};
    var max = $fill[0].getTotalLength();
    runNextFill();

    // Fill up the slow point path finder points
    function runNextFill() {
      fillCount+= parseInt(options.fillprecision);
      p = $fill.getPoint(fillCount);

      // Spiral is outside top left, and therefore can never return
      if (p.x < pathRect.x && p.y < pathRect.y ) fillCount = max;

      // Spiral is outside bottom right, and therefore can never return
      if (p.x > pathRect.x + pathRect.width && p.y > pathRect.y + pathRect.height) fillCount = max;

      if (fillCount < max) {
        // If the path is still visible here
        if (cncserver.paths.getPointPathCollide(p) == $path[0]){
          // Save the point!
          points.push([p.x, p.y]);
        }
        process.nextTick(runNextFill);
      } else { // Points are filled! Run the solver
        runTSPSolver();
      }
    }

    function runTSPSolver() {
      var numPoints = points.length-1;
      var _distances = null;
      var allDistances = new Array(numPoints);

      console.info('Finding distances between ' + numPoints + '...');

      // Calculate distances between all points(!!)
      for(var i=0; i<numPoints; i++){
        for(var j=0; j<numPoints; j++){

          if (typeof allDistances[i] === 'undefined') allDistances[i] = [];
          if (typeof allDistances[j] === 'undefined') allDistances[j] = [];

          if (i == j) {
            allDistances[i][j] = 0;
            continue;
          }

          var diff = robopaint.utils.getDistance(points[i], points[j]);

          allDistances[i][j] = diff;
          allDistances[j][i] = diff;
        }
      }

      _distances = new Tsp.Graph(numPoints);
      _distances.setAllDistances(allDistances);
      console.info('Distances enumerated...');

      var count = 0;
      var iterations = 0;

      if (options.tsprunnertype == 'opt') {
        // OPT2 RUNNER
        var _guessRoute = Tsp.createGuessRoute(_distances);
        iterations = 150;

        var runner = new Tsp.Sequential2OptRunner({
          startRoute:_guessRoute,
          distances:_distances,
          isKnownStart:false
        });
      } else {
        // ACO RUNNER
        var runner = new Tsp.SequentialACORunner({distances:_distances});
        iterations = 6;
      }

      var repeatInterval = setInterval(function(){
        count++;

        runner.runOnce();

        _guessRoute = runner.route;

        if (count >= iterations) {
          clearInterval(repeatInterval);

          // Push complex route into real run sequence!
          for (var i in runner.route) {
            var p = points[runner.route[i]];
            run('move', {x: p[0], y: p[1]});
            if (i == 0) run('down');
          }

          if (callback) callback();
        }
      }, 1);
    }
  },

  /**
   *  Wrapper to run fill for a given path
   *
   *  @param {object} $path
   *    The jQuery object for the path to be filled
   *  @param {function} callback
   *    Callback function for when the run completes
   *  @param {object} options
   *    The JSON set of options, if unset, defaults to copy of global settings
   *
   */
  runFill: function($path, callback, options) {

    // Default options object to a copy of the full global settings object
    if (typeof options == 'undefined') options = jQuery.extend({}, robopaint.settings);

    // runFill common stuff for code reuse ==================================
    $('#sim').hide(); // Hide sim window
    console.info($path[0].id + ' ' + options.filltype + ' path fill run started...');
    cncserver.cmd.run('up'); // Start with brush up
    cncserver.state.process.waiting = true;


    switch (options.filltype){
      case 'tsp':
        cncserver.paths._runTSPFill($path, options, runFillCallback);
        break;
      case 'spiral':
        cncserver.paths._runPathFill($path, options, runFillCallback);
        break;
      default: // Line based fill!
        cncserver.paths._runLineFill($path, options, runFillCallback);
    }

    // Common callback to handle more code reuse
    function runFillCallback() {
      cncserver.cmd.run('up');
      console.info($path[0].id + ' ' + options.filltype + ' path fill run done!');
      callback();
    }

  }
};
}});
