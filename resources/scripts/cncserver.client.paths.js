/**
 * @file Holds all CNC Server path management and tracing functions
 */

cncserver.paths = {
  // Find out what DOM object is directly below the point given
  // Will NOT work if point is outside visible screen range!
  getPointPathCollide: function(point) {
    return document.elementFromPoint(
      (point.x * cncserver.canvas.scale) + cncserver.canvas.offset.left,
      (point.y * cncserver.canvas.scale) + cncserver.canvas.offset.top
    );
  },

  // Run a path outline trace into the work queue
  runOutline: function($path, callback) {
    var run = cncserver.cmd.run;

    var steps = Math.round($path.maxLength / cncserver.config.precision) + 1;

    // Start with brush up
    run('up');

    // We can think of the very first brush down as waiting till we should paint
    cncserver.state.process.waiting = true;

    var i = 0;
    var lastPoint = {};
    var p = {};
    var delta = {};

    runNextPoint();

    function runNextPoint() {
      // Long process kill
      if (cncserver.state.process.cancel) {
        return;
      }

      if (i <= $path.maxLength) {
        i+= cncserver.config.precision;

        lastPoint = {x:p.x, y:p.y}; // Store the last run point
        p = $path.getPoint(i); // Get a new point
        delta = {x:lastPoint.x - p.x, y: lastPoint.y - p.y} // Store the difference

        // If the path is still visible here
        if (cncserver.paths.getPointPathCollide(p) == $path[0]){
          // Move to point!
          run('move', p);

          // If we were waiting, pen goes down
          if (cncserver.state.process.waiting) {
            run('down');
            cncserver.state.process.waiting = false;
          }
        } else { // Path is invisible, lift the brush if we're not already waiting
          if (!cncserver.state.process.waiting) {
            // Figure out how much change since last point, move more before lifting
            if (delta.x || delta.y) {
              var o = {x: p.x - (delta.x * 5), y: p.y - (delta.y * 5)};
              run('move', o); // Overshoot to make up for brush flexibility
            }

            run('up');
            cncserver.state.process.waiting = true;
          }
        }
        setTimeout(runNextPoint, 0);
      } else { // Done
        // Figure out how much change since last point, move more before lifting
        if (delta.x || delta.y) {
          var o = {x: p.x - (delta.x * 5), y: p.y - (delta.y * 5)};
          run('move', o); // Overshoot to make up for brush flexibility
        }

        run('up');
        console.info($path[0].id + ' path outline run done!');
        if (callback) callback();
      }
    }
  },

  // Run a full path fill into the buffer
  runFill: function($path, callback) {
    var run = cncserver.cmd.run;
    var pathRect = $path[0].getBBox();
    var $fill = cncserver.config.fillPath;

    // Start with brush up
    run('up');

    cncserver.state.process.waiting = true;

    var center = {
      x: pathRect.x + (pathRect.width / 2),
      y: pathRect.y + (pathRect.height / 2)
    }

    // Center the fill path
    $fill.attr('transform', 'translate(' + center.x + ',' + center.y + ')');

    $fill.transformMatrix = $fill[0].getTransformToElement($fill[0].ownerSVGElement);
    $fill.getPoint = function(distance){ // Handy helper function for gPAL
      var p = this[0].getPointAtLength(distance).matrixTransform(this.transformMatrix);
      return {x: p.x, y: p.y};
    };

    var i = 0;
    var p = {};
    var max = $fill[0].getTotalLength();
    runNextFill();

    function runNextFill() {
      // Long process kill
      if (cncserver.state.process.cancel) {
        return;
      }

      i+= cncserver.config.precision * 2;
      p = $fill.getPoint(i);

      // Spiral is outside top left, and therefore can never return
      if (p.x < pathRect.x && p.y < pathRect.y ) i = max;

      // Spiral is outside bottom right, and therefore can never return
      if (p.x > pathRect.x + pathRect.width && p.y > pathRect.y + pathRect.height) i = max;

      if (i < max) {
        // If the path is still visible here
        if (cncserver.paths.getPointPathCollide(p) == $path[0]){
          // Move to point!
          run('move', p);

          // If we were waiting, pen goes down
          if (cncserver.state.process.waiting) {
            run('down');
            cncserver.state.process.waiting = false;
          }
        } else { // Path is invisible, lift the brush if we're not already waiting
          if (!cncserver.state.process.waiting) {
            run('move', $fill.getPoint(i+5));
            run('up');
            cncserver.state.process.waiting = true;
          }
        }
        setTimeout(runNextFill, 0);
      } else { // Done
        run('up');
        console.info($path[0].id + ' path fill run done!');
        if (callback) callback();
      }
    }
  },

  // Run a full TSP path fill into the buffer
  runTSPFill: function($path, callback) {
    var run = cncserver.cmd.run;
    var pathRect = $path[0].getBBox();
    var $fill = cncserver.config.fillPath;
    var points = []; // Final points to run TSP on

    // Start with brush up
    run('up');

    cncserver.state.process.waiting = true;

    var center = {
      x: pathRect.x + (pathRect.width / 2),
      y: pathRect.y + (pathRect.height / 2)
    }

    // Center the fill path
    $fill.attr('transform', 'translate(' + center.x + ',' + center.y + ')');

    $fill.transformMatrix = $fill[0].getTransformToElement($fill[0].ownerSVGElement);
    $fill.getPoint = function(distance){ // Handy helper function for gPAL
      var p = this[0].getPointAtLength(distance).matrixTransform(this.transformMatrix);
      return {x: p.x, y: p.y};
    };

    var fillCount = 0;
    var p = {};
    var precision = 17;
    var max = $fill[0].getTotalLength();
    runNextFill();

    // Fill up the slow point path finder points
    function runNextFill() {
      fillCount+= precision;
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
        setTimeout(runNextFill, 0);
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

          var diff = cncserver.utils.getDistance(points[i], points[j]);

          allDistances[i][j] = diff;
          allDistances[j][i] = diff;
        }
      }

      _distances = new Tsp.Graph(numPoints);
      _distances.setAllDistances(allDistances);
      console.info('Distances enumerated...');

      var count = 0;

      var runnerType = 'opt';

      var iterations = 0;

      if (runnerType == 'opt') {
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
          }
          run('up');

          console.info($path[0].id + ' TSP path fill run done!');
          if (callback) callback();
        }
      }, 1);
    }
  }
};
