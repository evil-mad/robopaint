
var Tsp ={};

/*
License: MIT License
Copyright Joel Wenzel 2012

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

Tsp.Graph = function(numPoints){

	var _weightings = new Array(numPoints);
	var that = this;
	this.numPoints = numPoints;

	function init(){
		for(var i=0;i<numPoints;i++){
			_weightings[i] = new Array(numPoints);
			for(var j=0;j<numPoints;j++){
				_weightings[i][j] = 0;
			}
		}
	}

	init();

	this.setAllDistances = function(distances){
		if(distances.length != that.numPoints)
			throw "Distances do not match num Points";

		_weightings = distances;
	};

	this.setDistance = function(from, to, weight){
		_weightings[from][to] = weight;
		_weightings[to][from] = weight;
	};

	this.getDistance = function(from,to){
		return _weightings[from][to];
	}

	this.getRouteCost = function(route){
		return that.getSubRouteCost(route,0,route.length-1);
	};

	this.getSubRouteCost = function(route, from, to){
		var cost = 0;
		for(var i=from+1;i<=to;i++){
			cost += that.getDistance(route[i-1],route[i]);
		}
		return cost;
	};
};

/*
License: MIT License
Copyright Joel Wenzel 2012

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

Tsp.Sequential2OptRunner = function(options){//startRoute, distances, isKnownStart){

  if (typeof options.distances == 'undefined') options.distances = null;
  if (typeof options.startRoute == 'undefined') options.startRoute = [];
  if (typeof options.isKnownStart == 'undefined') options.isKnownStart = null;

  var that = this;
  var _distances = options.distances;
  var _isKnownStart = options.isKnownStart;

  this.route = options.startRoute;
  this.distance = _distances.getRouteCost(that.route);


  this.runOnce = function(){

    var changed = false;

    for(var i = 1;i<that.route.length;i++){
      var result = getBestRouteSplit(that.distance,that.route,i, _isKnownStart);

      if(result.nextCost<that.distance){
        changed = true;
        that.distance = result.nextCost;
        that.route = result.nextRoute;
      }
    }

    return changed;
  }



  function reverseArray(array){
    var t = new Array(array.length);
    for(var i=0;i<array.length;i++){
      t[i] = array[array.length-1-i];
    }
    return t;

  }


  function getSubArray(array, start, end){
    var t = new Array(end-start+1);

    for(var i=start;i<=end;i++){
      t[i-start] = array[i];
    }
    return t;
  }

  function getBestRouteSplit(currentCost, route, splitIndex, isStartKnown){
    if(!isStartKnown)
      return getBestRouteSplitUnknownStart(currentCost, route, splitIndex);
    return getBestRouteSplitKnownStart(currentCost, route, splitIndex);
  }

  //have to flip both the start and the end since we don't know the start point
  //this means there are several candidates for a single split index
  function getBestRouteSplitKnownStart(currentCost, route, splitIndex){

    //consider ab-cd splitting between b and c
    //case 0: ab-cd

    //flipping cases
    //case 1: ab-dc


    //calc costs

    var ab = _distances.getSubRouteCost(route, 0,splitIndex-1);
    //var cd = _distances.getSubRouteCost(route, splitIndex, route.length-1);

    var reverseRoute = reverseArray(route);
    var reverseSplitIndex = route.length - splitIndex;
    //var ba = _distances.getSubRouteCost(reverseRoute, reverseSplitIndex, route.length-1);
    var dc = _distances.getSubRouteCost(reverseRoute, 0,reverseSplitIndex-1);


    var nextRoute = route;
    var nextCost = currentCost;

    //case 1
    var tmp = ab + _distances.getDistance(route[splitIndex-1],route[route.length-1]) + dc;
    if(tmp<nextCost){
      nextCost = tmp;
      nextRoute = [].concat(
        getSubArray(route,0,splitIndex-1),
        getSubArray( reverseRoute, 0,reverseSplitIndex-1)
        );
    }

    return {nextRoute:nextRoute, nextCost: nextCost};
  }

  //have to flip both the start and the end since we don't know the start point
  //this means there are several candidates for a single split index
  function getBestRouteSplitUnknownStart(currentCost, route, splitIndex){

    //consider ab-cd splitting between b and c
    //case 0: ab-cd

    //flipping cases
    //case 1: ab-dc
    //case 2: ba-cd
    //case 3: ba-dc

    //swapping cases
    //case 4: dc-ab
    //case 5: cd-ba
    //case 6: dc-ba

    //calc costs

    var ab = _distances.getSubRouteCost(route, 0,splitIndex-1);
    var cd = _distances.getSubRouteCost(route, splitIndex, route.length-1);

    var reverseRoute = reverseArray(route);
    var reverseSplitIndex = route.length - splitIndex;
    var ba = _distances.getSubRouteCost(reverseRoute, reverseSplitIndex, route.length-1);
    var dc = _distances.getSubRouteCost(reverseRoute, 0,reverseSplitIndex-1);


    var nextRoute = route;
    var nextCost = currentCost;

    //case 1
    var tmp = ab + _distances.getDistance(route[splitIndex-1],route[route.length-1]) + dc;
    if(tmp<nextCost){
      nextCost = tmp;
      nextRoute = [].concat(
        getSubArray(route,0,splitIndex-1),
        getSubArray( reverseRoute, 0,reverseSplitIndex-1)
        );
    }

    //case 2
    var tmp = ba + _distances.getDistance(route[0],route[splitIndex]) + cd;
    if(tmp<nextCost){
      nextCost = tmp;
      nextRoute = [].concat(
        getSubArray( reverseRoute,reverseSplitIndex, reverseRoute.length-1),
        getSubArray(route,splitIndex, route.length-1)
        );
    }

    //case 3
    var tmp = ba + _distances.getDistance(route[0],route[route.length-1]) + dc;
    if(tmp<nextCost){
      nextCost = tmp;
      nextRoute = [].concat(
        getSubArray( reverseRoute,reverseSplitIndex, reverseRoute.length-1),
        getSubArray( reverseRoute, 0,reverseSplitIndex-1)
        );
    }

    //case 4
    var tmp = dc + _distances.getDistance(route[splitIndex],route[0]) + ab;
    if(tmp<nextCost){
      nextCost = tmp;
      nextRoute = [].concat(
        getSubArray( reverseRoute, 0,reverseSplitIndex-1),
        getSubArray(route,0,splitIndex-1)
        );
    }

    //case 5
    var tmp = cd + _distances.getDistance(route[route.length-1],route[splitIndex-1]) + ba;
    if(tmp<nextCost){
      nextCost = tmp;
      nextRoute = [].concat(
        getSubArray(route,splitIndex, route.length-1),
        getSubArray( reverseRoute,reverseSplitIndex, reverseRoute.length-1)
        );
    }

    //case 6
    var tmp = dc + _distances.getDistance(route[splitIndex],route[splitIndex-1]) + ba;
    if(tmp<nextCost){
      nextCost = tmp;
      nextRoute = [].concat(
        getSubArray( reverseRoute, 0,reverseSplitIndex-1),
        getSubArray( reverseRoute,reverseSplitIndex, reverseRoute.length-1)
        );
    }
    return {nextRoute:nextRoute, nextCost: nextCost};
  }
};


Tsp.createGuessRoute = function(_distances){
		var guessRoute = new Array(_distances.numPoints);

		var pointIndices = new Array(_distances.numPoints);
		for(var i=0;i<guessRoute.length;i++){
			pointIndices[i] = i;
		}

		for(var i=0;i<guessRoute.length;i++){

			var j = parseInt(Math.random()*pointIndices.length);
			guessRoute[i] = pointIndices[j];
			pointIndices.splice(j,1);

		}

		return guessRoute;
	}

/*
  License: MIT License

  A small section of the code (probability of selecting a route and phermon setting) is partially derived from the google TSP solver by James Tolley <info [at] gmaptools.com> and Geir K. Engdahl <geir.engdahl (at) gmail.com>
  Details: http://code.google.com/p/google-maps-tsp-solver/

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

  Resources
  //http://code.google.com/p/google-maps-tsp-solver/source/browse/trunk/BpTspSolver.js?r=11
  //http://gebweb.net/blogpost/2007/07/05/behind-the-scenes-of-optimap/
  //http://www.idsia.ch/~luca/acs-bio97.pdf
*/

Tsp.SequentialACORunner = function(options){

  if (typeof options.distances == 'undefined') options.distances = null;
  if (typeof options.startPoint == 'undefined') options.startPoint = null;

  var that = this;
  var _startPoint = options.startPoint;
  var _distances = options.distances;

  var _numPoints = _distances.numPoints;

  //Ant Constants
  var NUM_ANTS = 20;//20;
  var RHO = 0.1; // The decay rate of the pheromone trails
  var BETA = 3.0;// The importance of the durations
  var ALPHA = 0.1;// The importance of the previous trails
  var Q=1.0; //see wikipedia - updating pheromones

  var result = initPheromones();
  var _pher = result.pheromones;
  var _nextPher = result.pherUpdates;

  this.route = [];
  this.distance;
  this.routes;
  this.distances;


  this.getAverageDistance = function(){
    var sum = 0;
    for(var i=0;i<that.distances.length;i++){
      sum += that.distances[i];
    }

    return sum/that.distances.length;
  }

  this.getPheromones = function(){
    return _pher;
  };

  this.runOnce = function(){

    var result = sendWave(NUM_ANTS,_pher,_nextPher);
    that.routes = result.paths;
    that.distances = result.distances;
  }




  function initPheromones(){
    //init pheremons
    var pheromones = new Array(_numPoints);
    var pherUpdates = new Array(_numPoints);

    /*
    Get the average distance between points - http://www.ugosweb.com/Download/JavaACSFramework.pdf

    Note that for each point, the distance to itself is 0.  This means that
    the total number of valid distances is numPoints*(numPoints-1) since the distance
    to itself is not valid
    */
    var dsum = 0;
    for (var i = 0; i < _numPoints; ++i) {
      for (var j = 0; j < _numPoints; ++j) {
        dsum += _distances.getDistance(i,j);
      }
    }

    //each point has n-1 edges
    var totalEdges = (_numPoints*(_numPoints-1));
    var avgDistance = dsum/totalEdges;
    var initVal = Q/avgDistance;

    for (var i = 0; i < _numPoints; ++i) {
      pheromones[i] = new Array(_numPoints);
      pherUpdates[i] = new Array(_numPoints);

      for (var j = 0; j < _numPoints; ++j) {
        pheromones[i][j] = initVal;
        pherUpdates[i][j] = 0.0;
      }
    }

    return {pheromones:pheromones, pherUpdates:pherUpdates};
  }

  function sendWave(numAnts, pheromones, pherUpdates){

    var startPoint = null;//parseInt(Math.random()*_numPoints);

    var paths = new Array(numAnts);
    var distances = new Array(numAnts);

    var changed = false;
    for (var ant = 0; ant < numAnts; ++ant)
    {
      var result = findAntPath(pheromones, pherUpdates, startPoint);
      paths[ant] = result.path;
      distances[ant] = result.distance;

      if(that.route.length ==0 || result.distance<that.distance){
        that.distance = result.distance;
        that.route = result.path;
        changed = true;
      }
    }

    //update the smell globally
    for (var i = 0; i < _numPoints; ++i)
    {
      for (var j = 0; j < _numPoints; ++j)
      {
        pheromones[i][j] =
        //decay old pheromone
        pheromones[i][j] * (1.0 - RHO)
        //add new pheromone
        + pherUpdates[i][j];

        pherUpdates[i][j] = 0.0;
      }
    }

    return {paths:paths, distances:distances, changed:changed};
  }

  function findAntPath(pheromones, pherUpdates, startPoint){
    var currPath = new Array(_numPoints);
    var probability = new Array(_numPoints);
    var visited = new Array(_numPoints);


    if(startPoint == null){
      //start at a random location
      startPoint = parseInt(Math.random()*_numPoints);
    }

    var curr = startPoint;
    currPath[0] = curr;

    //get path for the ant
    //any has to visit each point so run this numPoints times
    //minus one since we visit the first node already
    for (var step = 1; step < _numPoints; step++)
    {
      visited[curr] = 1;

      //probability for next visit
      var probSum = 0.0;
      for (var next = 0; next < _numPoints; next++) {
        if (visited[next] != 1)
        {
          //probability[next] = distanceAB^-beta * pheromoneAB^alpha
          //see reference formula
          probability[next] = Math.pow(pheromones[curr][next], ALPHA) *
            Math.pow(_distances.getDistance(curr, next), 0.0-BETA);
          probSum += probability[next];
        }
        else {
          probability[next] = 0;
        }
      }

      //One method is to convert the probability array to actual probabilities by
      //dividing by probSum.  Then create a random value between 0 and 1 and add up probabilities
      //for each path to the next point until one finally surpasses the random value.
      //This point would be chosen for the next path.  Google does the same thing but
      //Just takes a percentage of probSum rather than convert everything to probabilities
      //between 0 and 1
      var nextCity = -1;
      var nextThresh = Math.random()*probSum;
      for(var i=0;i<_numPoints;i++){
        nextThresh -= probability[i];
        if (nextThresh<=0) {
          nextCity = i;
          break;
        }
      }

      currPath[step] = nextCity;
      curr = nextCity;
    }


    // do k2 optimization
    var opt2 = new Tsp.Sequential2OptRunner({startRoute:currPath, distances:_distances, isKnownStart:false});

    while(opt2.runOnce()){}

    currPath = opt2.route;

    var currDist = _distances.getRouteCost(currPath);

    //store pheromons so that they can be added to the previous
    //values after all the ants have finished
    for (var i = 0; i < _numPoints-1; i++)
    {
      pherUpdates[currPath[i]][currPath[i+1]] += Q/currDist;
    }

    return {distance:currDist, path:currPath};
  }
};

Tsp.drawRoute = function(ctx, route, points, alpha){
  //ctx.fillStyle="#ff0000";

  if(alpha == null)
    alpha = 1;
  ctx.strokeStyle = "rgba(0, 0, 0, "+alpha+")";
  ctx.moveTo(points[route[0]][0], points[route[0]][1]);

  for(var i=1;i<route.length;i++){
    ctx.lineTo(points[route[i]][0], points[route[i]][1]);
  }
  ctx.stroke();
}