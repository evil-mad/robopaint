/**
 * @file This file is a custom conglomeration of the 5 required files for cam
 * path cutting operations from the JSCut application by Todd Fleming:
 *  - api/js/data.js
 *  - js/Cam.js
 *  - api/js/cam.js
 *  - js/path.js
 *  - api/js/geometry.js
 *
 * Formatted into a tasty require() ready burrito, outputting the jscut object.
 *
 * The Following is the license header from the original files.
 ******************************************************************************
 *
 * Copyright 2014 Todd Fleming
 *
 * This file is part of jscut.
 *
 * jscut is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * jscut is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with jscut.  If not, see <http:*www.gnu.org/licenses/>.
 *
 */
"use strict";

module.exports = function(ClipperLib) {
  // Basic object setup.
  var jscut = {
    cam: {},
    data: {},
    priv: {
      cam: {},
      path: {},
    },
    geometry: {}
  };

/*
 █████  ██████  ██     ██    ██ ███████     ██ ██████   █████  ████████  █████          ██ ███████
██   ██ ██   ██ ██    ██     ██ ██         ██  ██   ██ ██   ██    ██    ██   ██         ██ ██
███████ ██████  ██   ██      ██ ███████   ██   ██   ██ ███████    ██    ███████         ██ ███████
██   ██ ██      ██  ██  ██   ██      ██  ██    ██   ██ ██   ██    ██    ██   ██    ██   ██      ██
██   ██ ██      ██ ██    █████  ███████ ██     ██████  ██   ██    ██    ██   ██ ██  █████  ███████
*/

  // Get the factor to convert units ("inch" or "mm") to inch
  jscut.data.getInchConversion = function (units) {
      if (units == "inch")
          return 1;
      else if (units == "mm")
          return 1 / 25.4;
      else {
          console.log("jscut.data.getInchConversion: units must be 'inch' or 'mm'");
          return Number.NaN;
      }
  }

  // Convert value to inch
  jscut.data.toInch = function (value, units) {
      return jscut.data.getInchConversion(units) * value;
  }

  // Convert value from inch
  jscut.data.fromInch = function (value, units) {
      return value / jscut.data.getInchConversion(units);
  }

  // Clean up material and return new object. Automatically converts old formats to new. json may be an object or text; if it's null or undefined then this creates an object with default values.
  jscut.data.cleanMaterial = function (json) {
      if (typeof json === 'undefined' || json == null)
          json = {};
      else if (typeof json === 'string')
          json = JSON.parse(json);

      var result = {
          units: "inch",
          thickness: "1.0",
          zOrigin: "Top",
          clearance: "0.1",
      }

      function fetch(name) {
          var v = json[name];
          if (typeof v !== "undefined")
              result[name] = v;
      }

      fetch('units');

      if (result.units == "mm") {
          result.thickness *= 25.4;
          result.clearance *= 25.4;
      }

      fetch('thickness');
      fetch('zOrigin');
      fetch('clearance');

      return result;
  }

  // Clean up tool and return new object. Automatically converts old formats to new. json may be an object or text; if it's null or undefined then this creates an object with default values.
  jscut.data.cleanTool = function (json) {
      if (typeof json === 'undefined' || json == null)
          json = {};
      else if (typeof json === 'string')
          json = JSON.parse(json);

      var result = {
          units: 'inch',
          diameter: .125,
          passDepth: .125,
          stepover: .4,
          rapidRate: 100,
          plungeRate: 5,
          cutRate: 40,
      }

      function fetch(name) {
          var v = json[name];
          if (typeof v !== "undefined")
              result[name] = v;
      }

      fetch('units');

      if (result.units == "mm") {
          result.diameter *= 2.54;
          result.passDepth *= 2.54;
          result.stepover *= 2.54;
          result.rapidRate *= 2.54;
          result.plungeRate *= 2.54;
          result.cutRate *= 2.54;
      }

      fetch('diameter');
      fetch('passDepth');
      if (typeof json.overlap !== "undefined") // backwards compat
          result.stepover = 1 - json.overlap;
      fetch('stepover');
      fetch('rapidRate');
      fetch('plungeRate');
      fetch('cutRate');

      return result;
  }

  // Clean up operation and return new object. Automatically converts old formats to new. json may be an object or text; if it's null or undefined then this creates an object with default values.
  jscut.data.cleanOperation = function (json) {
      if (typeof json === 'undefined' || json == null)
          json = {};
      else if (typeof json === 'string')
          json = JSON.parse(json);

      var result = {
          name: "",
          units: "inch",
          //enabled: true,
          ramp: true,
          combineOp: "Union",
          camOp: "Pocket",
          direction: "Conventional",
          cutDepth: .125,
          margin: 0,
          width: 0,
          geometries: [],
      }

      function fetch(name) {
          var v = json[name];
          if (typeof v !== "undefined")
              result[name] = v;
      }

      fetch('name');
      fetch('units');

      if (result.units == "mm") {
          result.cutDepth *= 2.54;
          result.margin *= 2.54;
          result.width *= 2.54;
      }

      //fetch('enabled');
      fetch('ramp');
      fetch('combineOp');
      fetch('camOp');
      fetch('direction');
      fetch('cutDepth');
      fetch('margin');
      fetch('width');
      fetch('geometries');

      if (result.camOp == "Outline") // backwards compat
          result.camOp = "Outside";

      return result;
  }

  // Clean up gcode options and return new object. Automatically converts old formats to new. json may be an object or text; if it's null or undefined then this creates an object with default values.
  jscut.data.cleanGcodeOptions = function (json) {
      if (typeof json === 'undefined' || json == null)
          json = {};
      else if (typeof json === 'string')
          json = JSON.parse(json);

      var result = {
          units: "mm",
          //gcodeFilename: "gcode.gcode",
          offsetX: 0,
          offsetY: 0,
      }

      function fetch(name) {
          var v = json[name];
          if (typeof v !== "undefined")
              result[name] = v;
      }

      fetch('units');

      if (result.units == "inch") {
          result.offsetX /= 25.4;
          result.offsetY /= 25.4;
      }

      //fetch('gcodeFilename');
      fetch('offsetX');
      fetch('offsetY');

      return result;
  }

/*
     ██ ███████     ██  ██████  █████  ███    ███         ██ ███████
     ██ ██         ██  ██      ██   ██ ████  ████         ██ ██
     ██ ███████   ██   ██      ███████ ██ ████ ██         ██ ███████
██   ██      ██  ██    ██      ██   ██ ██  ██  ██    ██   ██      ██
 █████  ███████ ██      ██████ ██   ██ ██      ██ ██  █████  ███████
*/

  function dist(x1, y1, x2, y2) {
      return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
  }

  // Does the line from p1 to p2 cross outside of bounds?
  function crosses(bounds, p1, p2) {
      if (bounds == null)
          return true;
      if (p1.X == p2.X && p1.Y == p2.Y)
          return false;
      var clipper = new ClipperLib.Clipper();
      clipper.AddPath([p1, p2], ClipperLib.PolyType.ptSubject, false);
      clipper.AddPaths(bounds, ClipperLib.PolyType.ptClip, true);
      var result = new ClipperLib.PolyTree();
      clipper.Execute(ClipperLib.ClipType.ctIntersection, result, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);
      if (result.ChildCount() == 1) {
          var child = result.Childs()[0];
          var points = child.Contour();
          if (points.length == 2) {
              if (points[0].X == p1.X && points[1].X == p2.X && points[0].Y == p1.Y && points[1].Y == p2.Y)
                  return false;
              if (points[0].X == p2.X && points[1].X == p1.X && points[0].Y == p2.Y && points[1].Y == p1.Y)
                  return false;
          }
      }
      return true;
  }

  // CamPath has this format: {
  //      path:               Clipper path
  //      safeToClose:        Is it safe to close the path without retracting?
  // }

  // Try to merge paths. A merged path doesn't cross outside of bounds. Returns array of CamPath.
  function mergePaths(bounds, paths) {
      if (paths.length == 0)
          return null;

      var currentPath = paths[0];
      currentPath.push(currentPath[0]);
      var currentPoint = currentPath[currentPath.length - 1];
      paths[0] = [];

      var mergedPaths = [];
      var numLeft = paths.length - 1;
      while (numLeft > 0) {
          var closestPathIndex = null;
          var closestPointIndex = null;
          var closestPointDist = null;
          for (var pathIndex = 0; pathIndex < paths.length; ++pathIndex) {
              path = paths[pathIndex];
              for (var pointIndex = 0; pointIndex < path.length; ++pointIndex) {
                  var point = path[pointIndex];
                  var dist = (currentPoint.X - point.X) * (currentPoint.X - point.X) + (currentPoint.Y - point.Y) * (currentPoint.Y - point.Y);
                  if (closestPointDist == null || dist < closestPointDist) {
                      closestPathIndex = pathIndex;
                      closestPointIndex = pointIndex;
                      closestPointDist = dist;
                  }
              }
          }

          path = paths[closestPathIndex];
          paths[closestPathIndex] = [];
          numLeft -= 1;
          var needNew = crosses(bounds, currentPoint, path[closestPointIndex]);
          path = path.slice(closestPointIndex, path.length).concat(path.slice(0, closestPointIndex));
          path.push(path[0]);
          if (needNew) {
              mergedPaths.push(currentPath);
              currentPath = path;
              currentPoint = currentPath[currentPath.length - 1];
          }
          else {
              currentPath = currentPath.concat(path);
              currentPoint = currentPath[currentPath.length - 1];
          }
      }
      mergedPaths.push(currentPath);

      var camPaths = [];
      for (var i = 0; i < mergedPaths.length; ++i) {
          var path = mergedPaths[i];
          camPaths.push({
              path: path,
              safeToClose: !crosses(bounds, path[0], path[path.length - 1])
          });
      }

      return camPaths;
  }

  // Compute paths for pocket operation on Clipper geometry. Returns array
  // of CamPath. cutterDia is in Clipper units. overlap is in the range [0, 1).
  jscut.priv.cam.pocket = function (geometry, cutterDia, overlap, climb) {
      var current = jscut.priv.path.offset(geometry, -cutterDia / 2);
      var bounds = current.slice(0);
      var allPaths = [];
      while (current.length != 0) {
          if (climb)
              for (var i = 0; i < current.length; ++i)
                  current[i].reverse();
          allPaths = current.concat(allPaths);
          current = jscut.priv.path.offset(current, -cutterDia * (1 - overlap));
      }
      return mergePaths(bounds, allPaths);
  };

  // Compute paths for pocket operation on Clipper geometry. Returns array
  // of CamPath. cutterDia is in Clipper units. overlap is in the range [0, 1).
  jscut.priv.cam.hspocket = function (geometry, cutterDia, overlap, climb) {
      "use strict";

      var memoryBlocks = [];

      var cGeometry = jscut.priv.path.convertPathsToCpp(memoryBlocks, geometry);

      var resultPathsRef = Module._malloc(4);
      var resultNumPathsRef = Module._malloc(4);
      var resultPathSizesRef = Module._malloc(4);
      memoryBlocks.push(resultPathsRef);
      memoryBlocks.push(resultNumPathsRef);
      memoryBlocks.push(resultPathSizesRef);

      //extern "C" void hspocket(
      //    double** paths, int numPaths, int* pathSizes, double cutterDia,
      //    double**& resultPaths, int& resultNumPaths, int*& resultPathSizes)
      Module.ccall(
          'hspocket',
          'void', ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
          [cGeometry[0], cGeometry[1], cGeometry[2], cutterDia, resultPathsRef, resultNumPathsRef, resultPathSizesRef]);

      var result = jscut.priv.path.convertPathsFromCppToCamPath(memoryBlocks, resultPathsRef, resultNumPathsRef, resultPathSizesRef);

      for (var i = 0; i < memoryBlocks.length; ++i)
          Module._free(memoryBlocks[i]);

      return result;
  };

  // Compute paths for outline operation on Clipper geometry. Returns array
  // of CamPath. cutterDia and width are in Clipper units. overlap is in the
  // range [0, 1).
  jscut.priv.cam.outline = function (geometry, cutterDia, isInside, width, overlap, climb) {
      var currentWidth = cutterDia;
      var allPaths = [];
      var eachWidth = cutterDia * (1 - overlap);

      var current;
      var bounds;
      var eachOffset;
      var needReverse;

      if (isInside) {
          current = jscut.priv.path.offset(geometry, -cutterDia / 2);
          bounds = jscut.priv.path.diff(current, jscut.priv.path.offset(geometry, -(width - cutterDia / 2)));
          eachOffset = -eachWidth;
          needReverse = climb;
      } else {
          current = jscut.priv.path.offset(geometry, cutterDia / 2);
          bounds = jscut.priv.path.diff(jscut.priv.path.offset(geometry, width - cutterDia / 2), current);
          eachOffset = eachWidth;
          needReverse = !climb;
      }

      while (currentWidth <= width) {
          if (needReverse)
              for (var i = 0; i < current.length; ++i)
                  current[i].reverse();
          allPaths = current.concat(allPaths);
          var nextWidth = currentWidth + eachWidth;
          if (nextWidth > width && width - currentWidth > 0) {
              current = jscut.priv.path.offset(current, width - currentWidth);
              if (needReverse)
                  for (var i = 0; i < current.length; ++i)
                      current[i].reverse();
              allPaths = current.concat(allPaths);
              break;
          }
          currentWidth = nextWidth;
          current = jscut.priv.path.offset(current, eachOffset);
      }
      return mergePaths(bounds, allPaths);
  };

  // Compute paths for engrave operation on Clipper geometry. Returns array
  // of CamPath.
  jscut.priv.cam.engrave = function (geometry, climb) {
      var allPaths = [];
      for (var i = 0; i < geometry.length; ++i) {
          var path = geometry[i].slice(0);
          if (!climb)
              path.reverse();
          path.push(path[0]);
          allPaths.push(path);
      }
      var result = mergePaths(null, allPaths);
      for (var i = 0; i < result.length; ++i)
          result[i].safeToClose = true;
      return result;
  };

  jscut.priv.cam.vPocket = function (geometry, cutterAngle, passDepth, maxDepth) {
      "use strict";

      if (cutterAngle <= 0 || cutterAngle >= 180)
          return [];

      var memoryBlocks = [];

      var cGeometry = jscut.priv.path.convertPathsToCpp(memoryBlocks, geometry);

      var resultPathsRef = Module._malloc(4);
      var resultNumPathsRef = Module._malloc(4);
      var resultPathSizesRef = Module._malloc(4);
      memoryBlocks.push(resultPathsRef);
      memoryBlocks.push(resultNumPathsRef);
      memoryBlocks.push(resultPathSizesRef);

      //extern "C" void vPocket(
      //    int debugArg0, int debugArg1,
      //    double** paths, int numPaths, int* pathSizes,
      //    double cutterAngle, double passDepth, double maxDepth,
      //    double**& resultPaths, int& resultNumPaths, int*& resultPathSizes)
      Module.ccall(
          'vPocket',
          'void', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
          [miscViewModel.debugArg0(), miscViewModel.debugArg1(), cGeometry[0], cGeometry[1], cGeometry[2], cutterAngle, passDepth, maxDepth, resultPathsRef, resultNumPathsRef, resultPathSizesRef]);

      var result = jscut.priv.path.convertPathsFromCppToCamPath(memoryBlocks, resultPathsRef, resultNumPathsRef, resultPathSizesRef);

      for (var i = 0; i < memoryBlocks.length; ++i)
          Module._free(memoryBlocks[i]);

      return result;
  };

  // Convert array of CamPath to array of Clipper path
  jscut.priv.cam.getClipperPathsFromCamPaths = function (paths) {
      var result = [];
      if (paths != null)
          for (var i = 0; i < paths.length; ++i)
              result.push(paths[i].path);
      return result;
  }

  var displayedCppTabError1 = false;
  var displayedCppTabError2 = false;

  function separateTabs(cutterPath, tabGeometry) {
      "use strict";

      if (tabGeometry.length == 0)
          return [cutterPath];
      if (typeof Module == 'undefined') {
          if (!displayedCppTabError1) {
              showAlert("Failed to load cam-cpp.js; tabs will be missing. This message will not repeat.", "alert-danger", false);
              displayedCppTabError1 = true;
          }
          return cutterPath;
      }

      var memoryBlocks = [];

      var cCutterPath = jscut.priv.path.convertPathsToCpp(memoryBlocks, [cutterPath]);
      var cTabGeometry = jscut.priv.path.convertPathsToCpp(memoryBlocks, tabGeometry);

      var errorRef = Module._malloc(4);
      var resultPathsRef = Module._malloc(4);
      var resultNumPathsRef = Module._malloc(4);
      var resultPathSizesRef = Module._malloc(4);
      memoryBlocks.push(errorRef);
      memoryBlocks.push(resultPathsRef);
      memoryBlocks.push(resultNumPathsRef);
      memoryBlocks.push(resultPathSizesRef);

      //extern "C" void separateTabs(
      //    double** pathPolygons, int numPaths, int* pathSizes,
      //    double** tabPolygons, int numTabPolygons, int* tabPolygonSizes,
      //    bool& error,
      //    double**& resultPaths, int& resultNumPaths, int*& resultPathSizes)
      Module.ccall(
          'separateTabs',
          'void', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
          [cCutterPath[0], cCutterPath[1], cCutterPath[2], cTabGeometry[0], cTabGeometry[1], cTabGeometry[2], errorRef, resultPathsRef, resultNumPathsRef, resultPathSizesRef]);

      if (Module.HEAPU32[errorRef >> 2] && !displayedCppTabError2) {
          showAlert("Internal error processing tabs; tabs will be missing. This message will not repeat.", "alert-danger", false);
          displayedCppTabError2 = true;
      }

      var result = jscut.priv.path.convertPathsFromCpp(memoryBlocks, resultPathsRef, resultNumPathsRef, resultPathSizesRef);

      for (var i = 0; i < memoryBlocks.length; ++i)
          Module._free(memoryBlocks[i]);

      return result;
  }

  // Convert paths to gcode. getGcode() assumes that the current Z position is at safeZ.
  // getGcode()'s gcode returns Z to this position at the end.
  // namedArgs must have:
  //      paths:          Array of CamPath
  //      ramp:           Ramp these paths?
  //      scale:          Factor to convert Clipper units to gcode units
  //      useZ:           Use Z coordinates in paths? (optional, defaults to false)
  //      offsetX:        Offset X (gcode units)
  //      offsetY:        Offset Y (gcode units)
  //      decimal:        Number of decimal places to keep in gcode
  //      topZ:           Top of area to cut (gcode units)
  //      botZ:           Bottom of area to cut (gcode units)
  //      safeZ:          Z position to safely move over uncut areas (gcode units)
  //      passDepth:      Cut depth for each pass (gcode units)
  //      plungeFeed:     Feedrate to plunge cutter (gcode units)
  //      retractFeed:    Feedrate to retract cutter (gcode units)
  //      cutFeed:        Feedrate for horizontal cuts (gcode units)
  //      rapidFeed:      Feedrate for rapid moves (gcode units)
  //      tabGeometry:    Tab geometry (optional)
  //      tabZ:           Z position over tabs (required if tabGeometry is not empty) (gcode units)
  jscut.priv.cam.getGcode = function (namedArgs) {
      var paths = namedArgs.paths;
      var ramp = namedArgs.ramp;
      var scale = namedArgs.scale;
      var useZ = namedArgs.useZ;
      var offsetX = namedArgs.offsetX;
      var offsetY = namedArgs.offsetY;
      var decimal = namedArgs.decimal;
      var topZ = namedArgs.topZ;
      var botZ = namedArgs.botZ;
      var safeZ = namedArgs.safeZ;
      var passDepth = namedArgs.passDepth;
      var plungeFeedGcode = ' F' + namedArgs.plungeFeed;
      var retractFeedGcode = ' F' + namedArgs.retractFeed;
      var cutFeedGcode = ' F' + namedArgs.cutFeed;
      var rapidFeedGcode = ' F' + namedArgs.rapidFeed;
      var tabGeometry = namedArgs.tabGeometry;
      var tabZ = namedArgs.tabZ;

      if (typeof useZ == 'undefined')
          useZ = false;

      if (typeof tabGeometry == 'undefined' || tabZ <= botZ) {
          tabGeometry = [];
          tabZ = botZ;
      }

      var gcode = "";

      var retractGcode =
          '; Retract\r\n' +
          'G1 Z' + safeZ.toFixed(decimal) + rapidFeedGcode + '\r\n';

      var retractForTabGcode =
          '; Retract for tab\r\n' +
          'G1 Z' + tabZ.toFixed(decimal) + rapidFeedGcode + '\r\n';

      function getX(p) {
          return p.X * scale + offsetX;
      }

      function getY(p) {
          return -p.Y * scale + offsetY;
      }

      function convertPoint(p) {
          result = ' X' + (p.X * scale + offsetX).toFixed(decimal) + ' Y' + (-p.Y * scale + offsetY).toFixed(decimal);
          if (useZ)
              result += ' Z' + (p.Z * scale + topZ).toFixed(decimal);
          return result;
      }

      for (var pathIndex = 0; pathIndex < paths.length; ++pathIndex) {
          var path = paths[pathIndex];
          var origPath = path.path;
          if (origPath.length == 0)
              continue;
          var separatedPaths = separateTabs(origPath, tabGeometry);

          gcode +=
              '\r\n' +
              '; Path ' + pathIndex + '\r\n';

          var currentZ = safeZ;
          var finishedZ = topZ;
          while (finishedZ > botZ) {
              var nextZ = Math.max(finishedZ - passDepth, botZ);
              if (currentZ < safeZ && (!path.safeToClose || tabGeometry.length > 0)) {
                  gcode += retractGcode;
                  currentZ = safeZ;
              }

              if (tabGeometry.length == 0)
                  currentZ = finishedZ;
              else
                  currentZ = Math.max(finishedZ, tabZ);
              gcode +=
                  '; Rapid to initial position\r\n' +
                  'G1' + convertPoint(origPath[0]) + rapidFeedGcode + '\r\n' +
                  'G1 Z' + currentZ.toFixed(decimal) + '\r\n';

              var selectedPaths;
              if (nextZ >= tabZ || useZ)
                  selectedPaths = [origPath];
              else
                  selectedPaths = separatedPaths;

              for (var selectedIndex = 0; selectedIndex < selectedPaths.length; ++selectedIndex) {
                  var selectedPath = selectedPaths[selectedIndex];
                  if (selectedPath.length == 0)
                      continue;

                  if (!useZ) {
                      var selectedZ;
                      if (selectedIndex & 1)
                          selectedZ = tabZ;
                      else
                          selectedZ = nextZ;

                      if (selectedZ < currentZ) {
                          var executedRamp = false;
                          if (ramp) {
                              var minPlungeTime = (currentZ - selectedZ) / namedArgs.plungeFeed;
                              var idealDist = namedArgs.cutFeed * minPlungeTime;
                              var end;
                              var totalDist = 0;
                              for (end = 1; end < selectedPath.length; ++end) {
                                  if (totalDist > idealDist)
                                      break;
                                  totalDist += 2 * dist(getX(selectedPath[end - 1]), getY(selectedPath[end - 1]), getX(selectedPath[end]), getY(selectedPath[end]));
                              }
                              if (totalDist > 0) {
                                  gcode += '; ramp\r\n'
                                  executedRamp = true;
                                  var rampPath = selectedPath.slice(0, end).concat(selectedPath.slice(0, end - 1).reverse());
                                  var distTravelled = 0;
                                  for (var i = 1; i < rampPath.length; ++i) {
                                      distTravelled += dist(getX(rampPath[i - 1]), getY(rampPath[i - 1]), getX(rampPath[i]), getY(rampPath[i]));
                                      var newZ = currentZ + distTravelled / totalDist * (selectedZ - currentZ);
                                      gcode += 'G1' + convertPoint(rampPath[i]) + ' Z' + newZ.toFixed(decimal);
                                      if (i == 1)
                                          gcode += ' F' + Math.min(totalDist / minPlungeTime, namedArgs.cutFeed).toFixed(decimal) + '\r\n';
                                      else
                                          gcode += '\r\n';
                                  }
                              }
                          }
                          if (!executedRamp)
                              gcode +=
                                  '; plunge\r\n' +
                                  'G1 Z' + selectedZ.toFixed(decimal) + plungeFeedGcode + '\r\n';
                      } else if (selectedZ > currentZ) {
                          gcode += retractForTabGcode;
                      }
                      currentZ = selectedZ;
                  } // !useZ

                  gcode += '; cut\r\n';

                  for (var i = 1; i < selectedPath.length; ++i) {
                      gcode += 'G1' + convertPoint(selectedPath[i]);
                      if (i == 1)
                          gcode += cutFeedGcode + '\r\n';
                      else
                          gcode += '\r\n';
                  }
              } // selectedIndex
              finishedZ = nextZ;
              if (useZ)
                  break;
          } // while (finishedZ > botZ)
          gcode += retractGcode;
      } // pathIndex

      return gcode;
  };

/*
 █████  ██████  ██     ██    ██ ███████     ██  ██████  █████  ███    ███         ██ ███████
██   ██ ██   ██ ██    ██     ██ ██         ██  ██      ██   ██ ████  ████         ██ ██
███████ ██████  ██   ██      ██ ███████   ██   ██      ███████ ██ ████ ██         ██ ███████
██   ██ ██      ██  ██  ██   ██      ██  ██    ██      ██   ██ ██  ██  ██    ██   ██      ██
██   ██ ██      ██ ██    █████  ███████ ██      ██████ ██   ██ ██      ██ ██  █████  ███████
*/


  // Get combined geometry for operation. This uses operation.combineOp to combine multiple geometries in operation.geometries.
  jscut.cam.getCombinedGeometry = function (operation) {
      operation = jscut.data.cleanOperation(operation);

      var combineFn;
      if (operation.combineOp == 'Union')
          combineFn = jscut.geometry.union;
      else if (operation.combineOp == 'Intersect')
          combineFn = jscut.geometry.intersect;
      else if (operation.combineOp == 'Diff')
          combineFn = jscut.geometry.difference;
      else if (operation.combineOp == 'Xor')
          combineFn = jscut.geometry.xor;
      else {
          console.log("jscut.cam.getCombinedGeometry: operation.combineOp must be 'Union', 'Intersect', 'Diff', or 'Xor'");
          return [];
      }

      if (operation.geometries.length == 0)
          return [];

      var result = operation.geometries[0];
      for (var i = 1; i < operation.geometries.length; ++i)
          result = combineFn(result, operation.geometries[i]);
      return result;
  }

  // Get preview geometry for operation
  jscut.cam.getPreviewGeometry = function (operation, tool) {
      operation = jscut.data.cleanOperation(operation);
      tool = jscut.data.cleanTool(tool);

      var result = jscut.cam.getCombinedGeometry(operation);

      var grow = operation.margin;
      if (operation.camOp == "Pocket" || operation.camOp == "Inside")
          grow = -grow;
      if (operation.camOp != "Engrave" && grow != 0)
          result = jscut.geometry.grow(result, grow, operation.units, 'round');

      if (operation.camOp == "Inside" || operation.camOp == "Outside" || operation.camOp == "Engrave") {
          var width = jscut.data.getInchConversion(operation.units) * operation.width;
          var diameter = jscut.data.getInchConversion(tool.units) * tool.diameter;
          if (width < diameter || operation.camOp == "Engrave")
              width = diameter;
          if (operation.camOp == "Inside")
              result = jscut.geometry.difference(result, jscut.geometry.grow(result, -width, 'inch', 'round'));
          else if (operation.camOp == "Outside")
              result = jscut.geometry.difference(jscut.geometry.grow(result, width, 'inch', 'round'), result);
          else
              result = jscut.geometry.difference(
                  jscut.geometry.grow(result, width / 2, 'inch', 'round'),
                  jscut.geometry.grow(result, -width / 2, 'inch', 'round'));
      }

      return result;
  }

  // Get cam paths for operation.
  // Each cam path has this format: {
  //      path:               Path data (geometry format)
  //      safeToClose:        Is it safe to close the path without retracting?
  // }
  jscut.cam.getCamPaths = function (operation, tool) {
      operation = jscut.data.cleanOperation(operation);
      tool = jscut.data.cleanTool(tool);

      var geometry = jscut.cam.getCombinedGeometry(operation);

      var grow = operation.margin;
      if (operation.camOp == "Pocket" || operation.camOp == "Inside")
          grow = -grow;
      if (operation.camOp != "Engrave" && grow != 0)
          geometry = jscut.geometry.grow(geometry, grow, operation.units, 'round');

      var diameter = jscut.geometry.getConversion(tool.units) * tool.diameter;

      if (operation.camOp == "Pocket")
          return jscut.priv.cam.pocket(geometry, diameter, 1 - tool.stepover, operation.direction == "Climb");
      else if (operation.camOp == "Inside" || operation.camOp == "Outside") {
          var width = jscut.geometry.getConversion(operation.units) * operation.width;
          if (width < diameter)
              width = diameter;
          return jscut.priv.cam.outline(geometry, diameter, operation.camOp == "Inside", width, 1 - tool.stepover, operation.direction == "Climb");
      }
      else if (operation.camOp == "Engrave")
          return jscut.priv.cam.engrave(geometry, operation.direction == "Climb");
      else {
          console.log("jscut.cam.getPaths: operation.camOp must be 'Pocket', 'Inside', 'Outside', or 'Engrave'");
          return [];
      }
  }

  // Convert cam paths to SVG path data format ('d' attribute).
  jscut.cam.toSvgPathData = function (camPaths, pxPerInch) {
      var paths = [];
      for (var i = 0; i < camPaths.length; ++i)
          paths.push(camPaths[i].path);
      return jscut.geometry.toSvgPathData(paths, pxPerInch, false);
  }

  // Get gcode header
  jscut.cam.getGcodeHeader = function (tool, material, gcodeOptions) {
      tool = jscut.data.cleanTool(tool);
      material = jscut.data.cleanMaterial(material);
      gcodeOptions = jscut.data.cleanGcodeOptions(gcodeOptions);

      var fromToolConv = jscut.data.getInchConversion(tool.units);
      var fromMatConv = jscut.data.getInchConversion(material.units);
      var toGcodeConv = 1 / jscut.data.getInchConversion(gcodeOptions.units);

      var topZ = 0;
      if (material.zOrigin != "Top")
          topZ = material.thickness * fromMatConv * toGcodeConv;

      var gcode = "";
      if (gcodeOptions.units == "inch")
          gcode += "G20         ; Set units to inches\r\n";
      else
          gcode += "G21         ; Set units to mm\r\n";
      gcode += "G90         ; Absolute positioning\r\n";
      gcode += "G1 Z" + (topZ + material.clearance * fromMatConv * toGcodeConv) +
          " F" + tool.rapidRate * fromToolConv * toGcodeConv + "      ; Move to clearance level\r\n"
      return gcode;
  }

  // Get gcode for operation.
  jscut.cam.getOperationGcode = function (opIndex, operation, tool, material, gcodeOptions, camPaths) {
      operation = jscut.data.cleanOperation(operation);
      tool = jscut.data.cleanTool(tool);
      material = jscut.data.cleanMaterial(material);
      gcodeOptions = jscut.data.cleanGcodeOptions(gcodeOptions);

      var fromOpConv = jscut.data.getInchConversion(operation.units);
      var fromToolConv = jscut.data.getInchConversion(tool.units);
      var fromMatConv = jscut.data.getInchConversion(material.units);
      var toGcodeConv = 1 / jscut.data.getInchConversion(gcodeOptions.units);

      var topZ = 0;
      var botZ = -operation.cutDepth * fromOpConv * toGcodeConv;
      if (material.zOrigin != "Top") {
          topZ = material.thickness * fromMatConv * toGcodeConv;
          botZ = topZ + botZ;
      }

      var gcode =
          "\r\n;" +
          "\r\n; Operation:    " + opIndex +
          "\r\n; Name:         " + operation.name +
          "\r\n; Type:         " + operation.camOp +
          "\r\n; Paths:        " + camPaths.length +
          "\r\n; Direction:    " + operation.direction +
          "\r\n; Cut Depth:    " + operation.cutDepth * fromOpConv * toGcodeConv +
          "\r\n; Pass Depth:   " + tool.passDepth * fromToolConv * toGcodeConv +
          "\r\n; Plunge rate:  " + tool.plungeRate * fromToolConv * toGcodeConv +
          "\r\n; Cut rate:     " + tool.cutRate * fromToolConv * toGcodeConv +
          "\r\n;\r\n";

      gcode += jscut.priv.cam.getGcode({
          paths: camPaths,
          ramp: operation.ramp,
          scale: 1 / jscut.geometry.getConversion(gcodeOptions.units),
          offsetX: gcodeOptions.offsetX,
          offsetY: gcodeOptions.offsetY,
          decimal: 4,
          topZ: topZ,
          botZ: botZ,
          safeZ: topZ + material.clearance * fromMatConv * toGcodeConv,
          passDepth: tool.passDepth * fromToolConv * toGcodeConv,
          plungeFeed: tool.plungeRate * fromToolConv * toGcodeConv,
          retractFeed: tool.rapidRate * fromToolConv * toGcodeConv,
          cutFeed: tool.cutRate * fromToolConv * toGcodeConv,
          rapidFeed: tool.rapidRate * fromToolConv * toGcodeConv,
      });
      return gcode;
  }

/*
     ██ ███████     ██ ██████   █████  ████████ ██   ██         ██ ███████
     ██ ██         ██  ██   ██ ██   ██    ██    ██   ██         ██ ██
     ██ ███████   ██   ██████  ███████    ██    ███████         ██ ███████
██   ██      ██  ██    ██      ██   ██    ██    ██   ██    ██   ██      ██
 █████  ███████ ██     ██      ██   ██    ██    ██   ██ ██  █████  ███████
*/

  jscut.priv.path.inchToClipperScale = 100000;                           // Scale inch to Clipper
  jscut.priv.path.cleanPolyDist = jscut.priv.path.inchToClipperScale / 100000;
  jscut.priv.path.arcTolerance = jscut.priv.path.inchToClipperScale / 40000;

  // Linearize a cubic bezier. Returns ['L', x2, y2, x3, y3, ...]. The return value doesn't
  // include (p1x, p1y); it's part of the previous segment.
  function linearizeCubicBezier(p1x, p1y, c1x, c1y, c2x, c2y, p2x, p2y, minNumSegments, minSegmentLength) {
      function bez(p0, p1, p2, p3, t) {
          return (1 - t) * (1 - t) * (1 - t) * p0 + 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t * p3;
      }

      if (p1x == c1x && p1y == c1y && p2x == c2x && p2y == c2y)
          return ['L', p2x, p2y];

      var numSegments = minNumSegments;
      while (true) {
          var x = p1x;
          var y = p1y;
          var result = ['L'];
          for (var i = 1; i <= numSegments; ++i) {
              var t = 1.0 * i / numSegments;
              var nextX = bez(p1x, c1x, c2x, p2x, t);
              var nextY = bez(p1y, c1y, c2y, p2y, t);
              if ((nextX - x) * (nextX - x) + (nextY - y) * (nextY - y) > minSegmentLength * minSegmentLength) {
                  numSegments *= 2;
                  result = null;
                  break;
              }
              result.push(nextX, nextY);
              x = nextX;
              y = nextY;
          }
          if (result)
              return result;
      }
  }

  // Linearize a path. Both the input path and the returned path are in snap.svg's format.
  // Calls alertFn with an error message and returns null if there's a problem.
  jscut.priv.path.linearizeSnapPath = function (path, minNumSegments, minSegmentLength, alertFn) {
      if (path.length < 2 || path[0].length != 3 || path[0][0] != 'M') {
          alertFn("Path does not begin with M")
          return null;
      }
      var x = path[0][1];
      var y = path[0][2];
      var result = [path[0]];
      for (var i = 1; i < path.length; ++i) {
          var subpath = path[i];
          if (subpath[0] == 'C' && subpath.length == 7) {
              result.push(linearizeCubicBezier(
                  x, y, subpath[1], subpath[2], subpath[3], subpath[4], subpath[5], subpath[6], minNumSegments, minSegmentLength));
              x = subpath[5];
              y = subpath[6];
          } else if (subpath[0] == 'M' && subpath.length == 3) {
              result.push(subpath);
              x = subpath[1];
              y = subpath[2];
          } else {
              alertFn("Subpath has an unknown prefix: " + subpath[0]);
              return null;
          }
      }
      return result;
  };

  // Get a linear path from an element in snap.svg's format. Calls alertFn with an
  // error message and returns null if there's a problem. Returns null without calling
  // alertFn if element.type == "svg".
  jscut.priv.path.getLinearSnapPathFromElement = function (element, minNumSegments, minSegmentLength, alertFn) {
      var path = null;

      if (element.type == "svg")
          return null;
      else if (element.type == "path")
          path = element.attr("d");
      else if (element.type == "rect") {
          var x = Number(element.attr("x"));
          var y = Number(element.attr("y"));
          var w = Number(element.attr("width"));
          var h = Number(element.attr("height"));
          path = 'm' + x + ',' + y + ' ' + w + ',' + 0 + ' ' + 0 + ',' + h + ' ' + (-w) + ',' + 0 + ' ' + 0 + ',' + (-h) + ' ';
      }
      else {
          alertFn("<b>" + element.type + "</b> is not supported; try Inkscape's <strong>Object to Path</strong> command");
          return null;
      }

      if (element.attr('clip-path') != "none") {
          alertFn("clip-path is not supported");
          return null;
      }

      if (element.attr('mask') != "none") {
          alertFn("mask is not supported");
          return null;
      }

      if (path == null) {
          alertFn("path is missing");
          return;
      }

      path = Snap.path.map(path, element.transform().globalMatrix);
      path = Snap.parsePathString(path);
      path = jscut.priv.path.linearizeSnapPath(path, minNumSegments, minSegmentLength, alertFn);
      return path;
  };

  // Convert a path in snap.svg format to Clipper format. May return multiple
  // paths. Only supports linear paths. Calls alertFn with an error message
  // and returns null if there's a problem.
  jscut.priv.path.getClipperPathsFromSnapPath = function (path, pxPerInch, alertFn) {
      function getClipperPointFromSnapPoint(x, y) {
          return {
              X: Math.round(x * jscut.priv.path.inchToClipperScale / pxPerInch),
              Y: Math.round(y * jscut.priv.path.inchToClipperScale / pxPerInch)
          };
      };

      if (path.length < 2 || path[0].length != 3 || path[0][0] != 'M') {
          alertFn("Path does not begin with M");
          return null;
      }
      var currentPath = [getClipperPointFromSnapPoint(path[0][1], path[0][2])];
      var result = [currentPath];
      for (var i = 1; i < path.length; ++i) {
          var subpath = path[i];
          if (subpath[0] == 'M' && subpath.length == 3) {
              currentPath = [getClipperPointFromSnapPoint(subpath[1], subpath[2])];
              result.push(currentPath);
          } else if (subpath[0] == 'L') {
              for (var j = 0; j < (subpath.length - 1) / 2; ++j)
                  currentPath.push(getClipperPointFromSnapPoint(subpath[1 + j * 2], subpath[2 + j * 2]));
          } else {
              alertFn("Subpath has a non-linear prefix: " + subpath[0]);
              return null;
          }
      }
      return result;
  };

  // Convert a set of Clipper paths to a single snap.svg path.
  jscut.priv.path.getSnapPathFromClipperPaths = function (path, pxPerInch) {
      function pushSnapPointFromClipperPoint(a, p) {
          a.push(p.X * pxPerInch / jscut.priv.path.inchToClipperScale);
          a.push(p.Y * pxPerInch / jscut.priv.path.inchToClipperScale);
      }

      var result = [];
      for (var i = 0; i < path.length; ++i) {
          var p = path[i];
          var m = ['M'];
          pushSnapPointFromClipperPoint(m, p[0]);
          result.push(m);
          var l = ['L'];
          for (var j = 1; j < p.length; ++j)
              pushSnapPointFromClipperPoint(l, p[j]);
          result.push(l);
      }
      return result;
  };

  // Convert Clipper paths to C format. Returns [double** cPaths, int cNumPaths, int* cPathSizes].
  jscut.priv.path.convertPathsToCpp = function(memoryBlocks, paths) {
      var doubleSize = 8;

      var cPaths = Module._malloc(paths.length * 4);
      memoryBlocks.push(cPaths);
      var cPathsBase = cPaths >> 2;

      var cPathSizes = Module._malloc(paths.length * 4);
      memoryBlocks.push(cPathSizes);
      var cPathSizesBase = cPathSizes >> 2;

      for (var i = 0; i < paths.length; ++i) {
          var path = paths[i];

          var cPath = Module._malloc(path.length * 2 * doubleSize + 4);
          memoryBlocks.push(cPath);
          if (cPath & 4)
              cPath += 4;
          //console.log("-> " + cPath.toString(16));
          var pathArray = new Float64Array(Module.HEAPU32.buffer, Module.HEAPU32.byteOffset + cPath);

          for (var j = 0; j < path.length; ++j) {
              var point = path[j];
              pathArray[j * 2] = point.X;
              pathArray[j * 2 + 1] = point.Y;
          }

          Module.HEAPU32[cPathsBase + i] = cPath;
          Module.HEAPU32[cPathSizesBase + i] = path.length;
      }

      return [cPaths, paths.length, cPathSizes];
  }

  // Convert C format paths to Clipper paths. double**& cPathsRef, int& cNumPathsRef, int*& cPathSizesRef
  // This version assume each point has X, Y (stride = 2).
  jscut.priv.path.convertPathsFromCpp = function (memoryBlocks, cPathsRef, cNumPathsRef, cPathSizesRef) {
      var cPaths = Module.HEAPU32[cPathsRef >> 2];
      memoryBlocks.push(cPaths);
      var cPathsBase = cPaths >> 2;

      var cNumPaths = Module.HEAPU32[cNumPathsRef >> 2];

      var cPathSizes = Module.HEAPU32[cPathSizesRef >> 2];
      memoryBlocks.push(cPathSizes);
      var cPathSizesBase = cPathSizes >> 2;

      var convertedPaths = [];
      for (var i = 0; i < cNumPaths; ++i) {
          var pathSize = Module.HEAPU32[cPathSizesBase + i];
          var cPath = Module.HEAPU32[cPathsBase + i];
          // cPath contains value to pass to Module._free(). The aligned version contains the actual data.
          memoryBlocks.push(cPath);
          if (cPath & 4)
              cPath += 4;
          var pathArray = new Float64Array(Module.HEAPU32.buffer, Module.HEAPU32.byteOffset + cPath);

          var convertedPath = [];
          convertedPaths.push(convertedPath);
          for (var j = 0; j < pathSize; ++j)
              convertedPath.push({
                  X: pathArray[j * 2],
                  Y: pathArray[j * 2 + 1]
              });
      }

      return convertedPaths;
  }

  // Convert C format paths to array of CamPath. double**& cPathsRef, int& cNumPathsRef, int*& cPathSizesRef
  // This version assume each point has X, Y, Z (stride = 3).
  jscut.priv.path.convertPathsFromCppToCamPath = function (memoryBlocks, cPathsRef, cNumPathsRef, cPathSizesRef) {
      var cPaths = Module.HEAPU32[cPathsRef >> 2];
      memoryBlocks.push(cPaths);
      var cPathsBase = cPaths >> 2;

      var cNumPaths = Module.HEAPU32[cNumPathsRef >> 2];

      var cPathSizes = Module.HEAPU32[cPathSizesRef >> 2];
      memoryBlocks.push(cPathSizes);
      var cPathSizesBase = cPathSizes >> 2;

      var convertedPaths = [];
      for (var i = 0; i < cNumPaths; ++i) {
          var pathSize = Module.HEAPU32[cPathSizesBase + i];
          var cPath = Module.HEAPU32[cPathsBase + i];
          // cPath contains value to pass to Module._free(). The aligned version contains the actual data.
          memoryBlocks.push(cPath);
          if (cPath & 4)
              cPath += 4;
          var pathArray = new Float64Array(Module.HEAPU32.buffer, Module.HEAPU32.byteOffset + cPath);

          var convertedPath = [];
          convertedPaths.push({ path: convertedPath, safeToClose: false });
          for (var j = 0; j < pathSize; ++j)
              convertedPath.push({
                  X: pathArray[j * 3],
                  Y: pathArray[j * 3 + 1],
                  Z: pathArray[j * 3 + 2],
              });
      }

      return convertedPaths;
  }

  // Simplify and clean up Clipper geometry. fillRule is ClipperLib.PolyFillType.
  jscut.priv.path.simplifyAndClean = function (geometry, fillRule) {
      geometry = ClipperLib.Clipper.CleanPolygons(geometry, jscut.priv.path.cleanPolyDist);
      geometry = ClipperLib.Clipper.SimplifyPolygons(geometry, fillRule);
      return geometry;
  }

  // Clip Clipper geometry. clipType is a ClipperLib.ClipType constant. Returns new geometry.
  jscut.priv.path.clip = function (paths1, paths2, clipType) {
      var clipper = new ClipperLib.Clipper();
      clipper.AddPaths(paths1, ClipperLib.PolyType.ptSubject, true);
      clipper.AddPaths(paths2, ClipperLib.PolyType.ptClip, true);
      var result = [];
      clipper.Execute(clipType, result, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);
      return result;
  }

  // Return difference between to Clipper geometries. Returns new geometry.
  jscut.priv.path.diff = function (paths1, paths2) {
      return jscut.priv.path.clip(paths1, paths2, ClipperLib.ClipType.ctDifference);
  }

  // Offset Clipper geometries by amount (positive expands, negative shrinks). Returns new geometry.
  jscut.priv.path.offset = function (paths, amount, joinType, endType) {
      if (typeof joinType == 'undefined')
          joinType = ClipperLib.JoinType.jtRound;
      if (typeof endType == 'undefined')
          endType = ClipperLib.EndType.etClosedPolygon;

      // bug workaround: join types are swapped in ClipperLib 6.1.3.2
      if (joinType == ClipperLib.JoinType.jtSquare)
          joinType = ClipperLib.JoinType.jtMiter;
      else if (joinType == ClipperLib.JoinType.jtMiter)
          joinType = ClipperLib.JoinType.jtSquare;

      paths = jscut.priv.path.simplifyAndClean(paths);

      var co = new ClipperLib.ClipperOffset(2, jscut.priv.path.arcTolerance);
      co.AddPaths(paths, joinType, endType);
      var offsetted = [];
      co.Execute(offsetted, amount);
      //offsetted = ClipperLib.Clipper.CleanPolygons(offsetted, jscut.priv.path.cleanPolyDist);
      return offsetted;
  }

/*
 █████  ██████  ██     ██    ██ ███████     ██  ██████  ███████  ██████  ███    ███ ███████ ████████ ██████  ██    ██      ██ ███████
██   ██ ██   ██ ██    ██     ██ ██         ██  ██       ██      ██    ██ ████  ████ ██         ██    ██   ██  ██  ██       ██ ██
███████ ██████  ██   ██      ██ ███████   ██   ██   ███ █████   ██    ██ ██ ████ ██ █████      ██    ██████    ████        ██ ███████
██   ██ ██      ██  ██  ██   ██      ██  ██    ██    ██ ██      ██    ██ ██  ██  ██ ██         ██    ██   ██    ██    ██   ██      ██
██   ██ ██      ██ ██    █████  ███████ ██      ██████  ███████  ██████  ██      ██ ███████    ██    ██   ██    ██ ██  █████  ███████
*/

  // Get the factor to convert units ("inch" or "mm") into geometry coordinates.
  jscut.geometry.getConversion = function (units) {
      if (units == "inch")
          return jscut.priv.path.inchToClipperScale;
      else if (units == "mm")
          return jscut.priv.path.inchToClipperScale / 25.4;
      else {
          console.log("jscut.geometry: units must be 'inch' or 'mm'");
          return Number.NaN;
      }
  }

  // Create empty geometry.
  jscut.geometry.createEmpty = function () {
      return [];
  }

  // Create a rectangle.
  jscut.geometry.createRect = function (x1, y1, x2, y2, units) {
      var conv = jscut.geometry.getConversion(units);
      if (isNaN(conv))
          return [];
      return [[
          { X: x1 * conv, Y: y1 * conv },
          { X: x2 * conv, Y: y1 * conv },
          { X: x2 * conv, Y: y2 * conv },
          { X: x1 * conv, Y: y2 * conv }]];
  }

  // Create a circle.
  jscut.geometry.createCircle = function (x, y, r, numSegments, units) {
      var conv = jscut.geometry.getConversion(units);
      if (isNaN(conv) || numSegments < 3)
          return [];
      x *= conv;
      y *= conv;
      r *= conv;
      var result = [];
      for (var i = 0; i < numSegments; ++i)
          result.push({
              X: x + r * Math.cos(2 * Math.PI * i / numSegments),
              Y: y + r * Math.sin(2 * Math.PI * i / numSegments)
          });
      return [result];
  }

  // Transform geometry. Returns new geometry.
  jscut.geometry.transform = function (matrix, geometry) {
      var result = [];
      for (var i = 0; i < geometry.length; ++i) {
          var subGeom = geometry[i];
          var newSubGeom = [];
          for (var j = 0; j < subGeom.length; ++j) {
              var point = subGeom[j];
              newSubGeom.push({
                  X: matrix[0][0] * point.X + matrix[0][1] * point.Y + matrix[0][2],
                  Y: matrix[1][0] * point.X + matrix[1][1] * point.Y + matrix[1][2]
              });
          }
          result.push(newSubGeom);
      }
      return result;
  }

  // Translate geometry. Returns new geometry.
  jscut.geometry.translate = function (geometry, dx, dy, units) {
      var conv = jscut.geometry.getConversion(units);
      if (isNaN(conv))
          return [];
      var matrix = [
          [1, 0, dx * conv],
          [0, 1, dy * conv]];
      return jscut.geometry.transform(matrix, geometry);
  }

  // Scale geometry. Returns new geometry.
  jscut.geometry.scale = function (geometry, scaleX, scaleY) {
      var matrix = [
          [scaleX, 0, 0],
          [0, scaleY, 0]];
      return jscut.geometry.transform(matrix, geometry);
  }

  // Rotate geometry. units is "deg" or "rad". Returns new geometry.
  jscut.geometry.rotate = function (geometry, angle, units) {
      var convertedAngle;
      if (units == "deg")
          convertedAngle = angle * Math.PI / 180;
      else if (units == "rad")
          convertedAngle = angle;
      else {
          console.log("jscut.geometry.rotate: units must be 'deg' or 'rad'");
          return [];
      }
      var matrix = [
          [Math.cos(convertedAngle), -Math.sin(convertedAngle), 0],
          [Math.sin(convertedAngle), Math.cos(convertedAngle), 0]];
      return jscut.geometry.transform(matrix, geometry);
  }

  // Grow geometry by distance. Negative distance shrinks.
  // join is "square", "round", or "miter". Returns new geometry.
  jscut.geometry.grow = function (geometry, distance, units, join) {
      var conv = jscut.geometry.getConversion(units);
      if(join=='square')
          join = ClipperLib.JoinType.jtSquare;
      else if(join=='round')
          join = ClipperLib.JoinType.jtRound;
      else if(join=='miter')
          join = ClipperLib.JoinType.jtMiter;
      else {
          console.log("jscut.geometry.grow: join must be 'square', 'round', or 'miter'");
          return [];
      }
      if (isNaN(conv))
          return [];
      return jscut.priv.path.offset(geometry, distance * conv, join);
  }

  // Intersect geometry. Returns new geometry.
  jscut.geometry.intersect = function (geometry1, geometry2) {
      return jscut.priv.path.clip(geometry1, geometry2, ClipperLib.ClipType.ctIntersection);
  }

  // Union geometry. Returns new geometry.
  jscut.geometry.union = function (geometry1, geometry2) {
      return jscut.priv.path.clip(geometry1, geometry2, ClipperLib.ClipType.ctUnion);
  }

  // Difference geometry. Returns new geometry.
  jscut.geometry.difference = function (geometry1, geometry2) {
      return jscut.priv.path.clip(geometry1, geometry2, ClipperLib.ClipType.ctDifference);
  }

  // Xor geometry. Returns new geometry.
  jscut.geometry.xor = function (geometry1, geometry2) {
      return jscut.priv.path.clip(geometry1, geometry2, ClipperLib.ClipType.ctXor);
  }

  // Convert geometry to SVG path data format ('d' attribute). Closes each path if
  // closePaths is true. closePaths defaults to true; set it to false it you're
  // converting CAM paths.
  jscut.geometry.toSvgPathData = function (geometry, pxPerInch, closePaths) {
      if (typeof closePaths == 'undefined')
          closePaths = true;
      var scale = pxPerInch / jscut.priv.path.inchToClipperScale;
      var result = "";
      for (var i = 0; i < geometry.length; ++i) {
          var subGeom = geometry[i];
          for (var j = 0; j < subGeom.length; ++j) {
              var point = subGeom[j];
              if (j == 0)
                  result += "M ";
              else
                  result += "L ";
              result += point.X * scale + " " + (-point.Y) * scale + " ";
          }
          if (closePaths)
              result += "Z ";
      }
      return result;
  }

  // Convert geometry to an SVG path object and set attributes. Closes each path if
  // closePaths is true. closePaths defaults to true; set it to false it you're
  // converting CAM paths.
  jscut.geometry.toSvgPathObject = function (geometry, pxPerInch, attributes, closePaths) {
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute('d', jscut.geometry.toSvgPathData(geometry, pxPerInch, closePaths));
      for (var k in attributes)
          path.setAttribute(k, attributes[k]);
      return path;
  }


/*
███████ ██ ███    ██ ██ ███████ ██   ██
██      ██ ████   ██ ██ ██      ██   ██
█████   ██ ██ ██  ██ ██ ███████ ███████
██      ██ ██  ██ ██ ██      ██ ██   ██
██      ██ ██   ████ ██ ███████ ██   ██
*/

  return jscut;
};
