/**
 * @file Holds D3 Homescreen logic and code. If this code seems a bit wacky
 * compared with the rest of the codebase, that's because it is basically its
 * own application, and we're eschewing any more normal style templates for
 * code generation of SVG defs and elements.
 *
 * Documentation is sparse, but more will be added as this visualization
 * improves through iteration.
 */

// Tweak variables
var iconAdj = 1.4; // Mode icon size multiplier
var logoAdj = 1.9; // Central logo size multiplier
var bottomAdj = 1.4; // Mode bottom img multiplier
var modeRadius = 70; // Mode Bubble Radius
var coreRadius = 90; // Core Mode Bubble Radius
var logoRadius = 100; // Radius of central logo
var forceFriction = 0.95; // General spatial friction between nodes.
var forceChargeMultiplier = 20; // Relative negative force between nodes.
var forceAlphaThreshold = 0.01; // Value to wait for when calming down.
var forceAlphaSafetyIterations = 500; // Max number of runs for calming down.
var cloud = [[289,61],[286,85],[278,107],[264,127],[246,144],[225,157],[201,165],[175,167],[150,167],[124,167],[99,167],[73,167],[48,167],[22,167],[-3,167],[-29,167],[-54,167],[-80,167],[-105,167],[-131,167],[-156,167],[-181,162],[-205,154],[-226,140],[-244,124],[-259,104],[-270,82],[-275,59],[-276,35],[-272,11],[-263,-11],[-250,-32],[-232,-49],[-212,-63],[-201,-81],[-199,-105],[-193,-128],[-182,-150],[-168,-170],[-150,-187],[-130,-202],[-108,-213],[-83,-220],[-58,-223],[-33,-222],[-8,-217],[16,-209],[38,-196],[57,-181],[74,-162],[86,-142],[104,-144],[128,-151],[154,-151],[177,-142],[196,-126],[209,-106],[214,-82],[210,-59],[208,-41],[232,-32],[252,-18],[269,0],[281,21],[288,44]];
var cloudOffset = [275, 225]; // Center offset for the cloud polygon above ^^
var modeBackgroundSize = [570, 400]; // Size for the background coverup.
var modeNameTextPadding = 12; // Text padding around the fit text in the circle.
var detailTextBox = [560, 128, -275, 40]; // w/h/x/y of detail text box.
var detailTextPadding = 18; // Padding around detail text.
var enterButton = [170, -15, 90]; // x/y/w&h of Mode Button
var slideshowStartRange = [5, 15]; // Slideshow start time random range min/max.
var slideshowTransition = 1000; // Slideshow transition time in ms.
var slideshowHoldTime = 10; // Slideshow hold time ins seconds.

// Adjusted during a resize later on
var margin = [30, 40]; // l-R/T-B side combined margin
var toolBarHeight = 40;
var width = $(window).width() - margin[0];
var height = $(window).height() - toolBarHeight - margin[1]; // Remove toolbar height.
var center = [width/2, height/2];

// State vars (global to this module, instantiated on D3 Ready load).
var d3Ready = false;
var modesLoaded = false;
window.graphNodes = [];
var svg;
var force;
var node;
var drag;

// Load d3 & d3Plus (this takes some time). This load and mode loading are in a
// race to the finish, and we need both to continue. I personally assume mode
// loading will ALWAYS be quicker, but just in case that isn't so in the future,
// Each of these checks if the other is ready before loading the init.
rpRequire('d3plus', function(){
  d3Ready = true;
  if (modesLoaded) {
    initHome();
  }
});


// Exports a single function to initiate the D3 force layout for the modes
// object given at init.
module.exports = {
  modesLoaded: function() {
    modesLoaded = true;
    if (d3Ready) {
      initHome();
    }
  },
  updateText: function() {
    // TODO!
  },

  // Enable or disable a mode bubble.
  modeStatus: function(id, enabled) {
    if (!d3Ready || !modesLoaded) return;
    var n = d3.select('#' + id);

    if (enabled) {
      if (n.classed('disabled')) {
        n.classed('disabled', false)
        .each(function(d){
          d.enabled = true;
          d.fixed = false;
          force.resume();
        });
      }
    } else {
      if (!n.classed('disabled')) {
        n.classed('disabled', true)
        .each(function(d){
          d.enabled = false;
          force.resume();
        });
      }
    }

    smoothForceWonkiness();
  }
}

// Build the SVG layout
function initHome() {
  setupSVG();
  buildNodeList();
  buildSVGDefs();
  buildForceGraph();
  initPreviewSlideshow();
  smoothForceWonkiness();
}

function setupSVG() {
  force = d3.layout.force()
    .size([width, height])
    .charge(calcNodeCharge)
    .friction(forceFriction)
    .on("tick", tick);

  drag = d3.behavior.drag()
      .on("dragstart", dragstart)
      .on("drag", drag)
      .on("dragend", dragend);

  svg = d3.select("body").append("svg")
      .attr("width", width)
      .attr("height", height)
      .style({
        top: toolBarHeight + (margin[1] / 2),
        left: margin[0] / 2
      });

  $(window).resize(function(){
    width = $(window).width() - margin[0];
    height = $(window).height() - toolBarHeight - margin[1];
    svg.attr("width", width).attr("height", height);

    force.size([width, height]).resume();
  }).resize();

}

// Build out the list of graph node data array that will have force layout
// applied from the list of modes & data.
function buildNodeList() {
  graphNodes = [];

  // Main app logo center.
  graphNodes.push({
    x: center[0], y: center[1]-128,
    radius: logoRadius,
    fixed: true,
    enabled: true,
    type: 'logo',
    icon: 'images/watercolorbot_icon.svg',
    id:"", name: "", detail: ""
  })

  // Build out graph node specifics for each mode.
  var index = 0;
  _.each(robopaint.modes, function(mode) {
    var a = ((360 / robopaint.modes.length) * index) * Math.PI/180;
    var placementRadius = 100; // A total guess.
    var m = mode.robopaint;

    graphNodes.push({
      type: 'mode',
      enabled: mode.enabled,
      x: Math.cos(a) * placementRadius + center[0],
      y: Math.sin(a) * placementRadius + center[1],
      id: m.name,
      icon: mode.root + m.graphics.icon,
      radius: mode.robopaint.core ? coreRadius : modeRadius,
      name: i18n.t('modes.' + m.name + '.info.use'),
      detail: i18n.t('modes.' + m.name + '.info.detail'),
      title: i18n.t('modes.' + m.name + '.info.name'),
      imgs: (function(){
        var o=[]; _.each(m.graphics.previews, function(p){
          o.push(mode.root + p);
        }); return o;
      })()
    });

    index++;
  });
}

function buildForceGraph() {
  force
    .nodes(graphNodes)
    .start();

  node = svg.selectAll(".node")
    .data(graphNodes)
    .enter().append("g") // This group is clipped and holds all content and force moves
    .attr("clip-path", function(d){ return d.type === 'mode' ? "url(#clip-" + d.id + ")" : '';})
    .attr("class", function(d){ return "node " + d.type + (!d.enabled ? ' disabled' : '')})
    .attr("id", function(d){ return d.id})
    .on("click", click)
    .on("mouseover", mouseover)
    .on("mouseout", mouseout)
    .call(drag);


   // This group adjusts content position within the group for the clipping offset
  var inner = node.append('g')
    .attr('class', 'inner')
    .attr('transform', function(d){
      return d.type === 'mode' ? "translate(" + cloudOffset.join() + ")" : "";
    });

  // Background for small and large mode
  inner.append("rect")
    .attr('class', 'mode-background')
    .attr('width', modeBackgroundSize[0])
    .attr('height', modeBackgroundSize[1])
    .attr('x', -cloudOffset[0])
    .attr('y', -cloudOffset[1]);

  // Mode name and alignment/wrap temp circle
  inner.append("circle")
    .attr('class', 'temp-circle')
    .attr("r", function(d){ return d.radius});

  inner.append("text")
    .text(function(d) { return d.name })
    .attr('opacity', 0)
    .attr('class', 'mode-name')
    .call(wrapText, 'mode-name', modeNameTextPadding);


  // Group for the preview images to go into
  inner.append("g").attr('class', 'previews');

  // Append the Preview images
  _.each(graphNodes, function(d){
    if (d.type !== 'mode') return;
    _.each(d.imgs, function(path, index){
      d3.select('#' + d.id + ' .previews').append('image')
        .attr('class', 'preview')
        .attr("opacity", "1")
        .attr("xlink:href", path)
        .attr('x', -cloudOffset[0])
        .attr('y', -cloudOffset[1])
        .attr('width', modeBackgroundSize[0])
        .attr('height', modeBackgroundSize[1]);
    });
  });

  // ICON!
  inner.append("image")
    .attr("opacity", "1")
    .attr('class', 'icon')
    .attr("xlink:href", function(d){ return d.icon; })
    .attr("x", function(d){
      if (d.type === "mode") {
        return -(d.radius * iconAdj)/2;
      } else {
        return -(d.radius * logoAdj)/2;
      }
    })
    .attr("y", function(d){
      if (d.type === "mode") {
        return -(d.radius * iconAdj)/2;
      } else {
        return -(d.radius * logoAdj)/2;
      }
    })
    .attr("width", function(d){
      if (d.type === "mode") {
        return d.radius * iconAdj;
      } else {
        return d.radius * logoAdj;
      }
    })
    .attr("height", function(d){
      if (d.type === "mode") {
        return d.radius * iconAdj;
      } else {
        return d.radius * logoAdj;
      }
    });

  // Detail Text & holder
  inner.append("rect")
    .attr('class', 'temp-rect')
    .attr('width', detailTextBox[0])
    .attr('height', detailTextBox[1])
    .attr('x', detailTextBox[2])
    .attr('y', detailTextBox[3]);

  inner.append("text")
    .text(function(d) { return d.detail })
    .attr('opacity', 0)
    .attr('class', 'mode-detail')
    .call(wrapText, 'mode-detail', detailTextPadding);

  // This goes over the top of everything (except the buttons)
  node.append("path")
    .attr('class', "circle")
    .attr('transform', "translate(" + cloudOffset.join() + ")")
    .attr("d", function(d){
      return d.type === 'mode' ? coordToD(shapeTweenCircle(cloud, d.radius)) : '';
    });

  // Enter Mode Button
  node.append("image")
    .attr('class', 'enter-mode')
    .attr('x', enterButton[0] + cloudOffset[0])
    .attr('y', enterButton[1] + cloudOffset[1])
    .attr('width', enterButton[2])
    .attr('height', enterButton[2])
    .attr("xlink:href", 'images/icons/enter_mode.svg')
    .on('mouseover', function(d) {
      d3.select(this)
        .transition()
        .duration(250)
        .attr('transform', "translate(-73, -38) scale(1.15)");
    })
    .on('mouseout', function(d) {
      d3.select(this)
        .transition()
        .duration(250)
        .attr('transform', "translate(0, 0) scale(1)");
    })
    .on('click', function(d) {
      enterMode(d.id);
    });


  // Enter Mode Button BOTTOM
  node.append("image")
    .attr("opacity", "0")
    .attr('class', 'enter-mode-bottom')
    .attr('x', function(d){return -(d.radius * bottomAdj/2) + cloudOffset[0] })
    .attr('y', function(d){return d.radius - (25*bottomAdj) + cloudOffset[1]})
    .attr('width', function(d){return d.radius * bottomAdj})
    .attr('height', function(d){return 40})
    .attr("xlink:href", 'images/icons/enter_mode_bottom.svg')
    .on('mouseover', function(d) {
      var hoverAdj = bottomAdj + 0.6;
      d3.select(this)
        .attr('x', -(d.radius * hoverAdj/2) + cloudOffset[0])
        .attr('y', d.radius - (20*hoverAdj) + cloudOffset[1])
        .attr('width', d.radius * hoverAdj)
        .attr('height', 40);
    })
    .on('mouseout', function(d) {
      d3.select(this)
        .attr('x', -(d.radius * bottomAdj/2) + cloudOffset[0])
        .attr('y', d.radius - (25*bottomAdj) + cloudOffset[1])
        .attr('width', d.radius * bottomAdj)
        .attr('height', 40);
    })
    .on('click', function(d) {
      enterMode(d.id);
      d3.event.stopPropagation();
    });


  // Remove anything that isn't the icon from the logo
  d3.selectAll('.logo .inner *:not(image), .logo > *:not(g)').remove();
}

function initPreviewSlideshow() {
  // For every mode that has 2 or more previews...
  _.each(robopaint.modes, function(mode) {
    if (mode.robopaint.graphics.previews.length > 1) {
      setTimeout(function() {
        setInterval(function(){
          d3.select('#' + mode.robopaint.name + ' .previews image:last-child')
            .transition()
            .duration(slideshowTransition)
            .attr('opacity', 0)
            .each("end", function(){
              // After fading out, move it to the "bottom" and reset its opacity
              d3.select(this)
                .moveToBack()
                .attr('opacity', 1);
            });
        }, slideshowHoldTime * 1000);
      }, slideshowStartRange[0] + (Math.random() * slideshowStartRange[1]) * 1000);
    }
  });
}

function enterMode(name){
  robopaint.switchMode(name);
}

function smoothForceWonkiness() {
  var safety = 0;
  // Even out initial wonkiness
  while(force.alpha() > forceAlphaThreshold) {
    force.tick();
    if(safety++ > forceAlphaSafetyIterations) {
      break; // Avoids infinite looping in case this solution was a bad idea
    }
  }
}

// Requires text be right above wrap element
function wrapText(elems, name, padding) {
  _.each(elems[0], function(text){
    var d = text.__data__;

    if (d.type !== 'mode') return;

    d3plus.textwrap()
      .container("#" + d.id + ' .' + name)
      .resize(true)
      .valign("middle")
      .padding(padding)
      .align('center')
      .draw();

    // Remove Rectangle...
    if (name === 'mode-detail') {
      //d3.select("#" + d.id + ' .temp-rect').remove();
    } else {
      d3.select("#" + d.id + ' .temp-circle').remove();
    }

  });

}

function calcNodeCharge(d) {
  return -d.radius * forceChargeMultiplier;
}

function tick() {
  node.attr("transform", function(d) {
    var x, y;

    // "Hide" disabled items
    if (d.enabled === false) {
      d.fixed = true;
      x = (width/2) - cloudOffset[0];
      y = (height/2) - cloudOffset[1];
      d.x = width/2; d.y = height/2;
      return "translate(" + x + "," + y + ")";
    }

    if (d.type === "mode" && !d.selected && !d.changing) {
      x = Math.max(d.radius, Math.min(width - d.radius, d.x)) - cloudOffset[0];
      y = Math.max(d.radius, Math.min(height - d.radius, d.y)) - cloudOffset[1];
      return "translate(" + x + "," + y + ")";
    } else if (d.selected && !d.changing) {
      x = (width/2) - cloudOffset[0];
      y = (height/2) - cloudOffset[1];
      return "translate(" + x + "," + y + ")";
    } else if (d.type ==="logo") {
      x = width/2;
      y = height/2;
      d.x = x; d.y = y;
      return "translate(" + x + "," + y + ")";
    } else if (d.changing) {
      return d3.select(this).attr('transform');
    }
  });
}

function mouseover(d, i) {
  if (d.type !== 'mode' || d.selected || d.changing) return;

  d3.select(this).select('.icon')
    .transition()
      .duration(450)
      .attr("opacity", "0.2");

  d3.select(this).select('.enter-mode-bottom')
    .transition()
      .duration(450)
      .attr("opacity", "1");

  d3.select(this).selectAll('.preview')
    .transition()
      .duration(450)
      .attr("opacity", "0.1");

  d3.select(this).select('.mode-name')
    .moveToFront()
    .transition()
      .duration(450)
      .attr("opacity", "1");
}

function mouseout(d, i) {
  if (d.type !== 'mode' || d.selected || d.changing) return;

  d3.select(this).select('.icon')
    .transition()
      .duration(450)
      .attr("opacity", "1");

  d3.select(this).select('.enter-mode-bottom')
    .transition()
      .duration(450)
      .attr("opacity", "0");

  d3.select(this).selectAll('.preview')
    .transition()
      .duration(450)
      .attr("opacity", "1");

  d3.select(this).select('.mode-name')
    .transition()
      .duration(450)
      .attr("opacity", "0");
}


function click(d, i) {
  if (d.type !== 'mode') return;

  // If something else is selected, act like the click went to it.
  if ($('.node.selected').length) {
    d = d3.select('.node.selected').data()[0];
  }

  // Send to the front
  var id = '#' + d.id;
  var item = d3.select(id);

  var goTo = []; // Destination coordinate
  var pathData = ""; // Destination path shape
  var iconPos = []; // Destination for icon position
  var iconSize = 0;

  d.changing = true;
  if (item.classed('selected')) {
    d.selected = false;
    goTo = d.lastPos;
    iconPos = [-(d.radius * iconAdj)/2,  -(d.radius * iconAdj)/2]; // Center
    iconSize = d.radius * iconAdj;

    item.classed('selected', false);
    pathData = coordToD(shapeTweenCircle(cloud, d.radius));

    // Clear Desat
    d3.selectAll('.desat').classed('desat', false);
  } else {
    d.selected = true;
    item.moveToFront();
    d.lastPos = [d.x-cloudOffset[0], d.y - cloudOffset[1]];
    goTo = [(width/2) - cloudOffset[0], (height/2) - cloudOffset[1]]; // Go to center
    iconPos = [105,  -135];
    iconSize = 90;

    item.classed('selected', true);

    // Desat all non-selected
    d3.selectAll('.mode:not(.selected)').classed('desat', true);

    pathData = coordToD(cloud);
  }

  // Transition group to position
  item
    .transition()
    .duration(700)
    .attr('transform', "translate(" + goTo.join() + ")")
    .each("end", function(){
      if (d.selected){
        // Fade in detail text
        d3.select("#" + d.id + " .mode-detail").transition().duration(300).attr('opacity', 1);
        d3.select(id + " .enter-mode-bottom").attr('transform', "scale(0)");
      } else {
        d3.select(id + " .enter-mode-bottom").attr('transform', "scale(1)");
      }
    });

  // Transition Circle Shape
  d3.select(id + " .circle")
    .transition()
    .duration(1000)
    .attr('d', pathData)
    .each('end', function(){
      d.changing = false;
    });

    // Transition CLIP shape
    d3.select("#clip-" + d.id + " .circle")
      .transition()
      .duration(1000)
      .attr('d', pathData);


  // Transition Icon width/position
  d3.select(id + " .icon")
    .transition()
    .duration(1000)
    .attr('x', iconPos[0])
    .attr('y', iconPos[1])
    .attr('width', iconSize)
    .attr('height', iconSize)
    .attr('opacity', 1);

  // ALWAYS hide mode name text
  d3.select(id + " .mode-name")
    .transition()
    .duration(1000)
    .attr('opacity', 0);

  // ALWAYS Show preview images
  d3.selectAll(id + " .preview")
    .transition()
    .duration(450)
    .attr('opacity', 1);

  // ALWAYS hide mode bottom
  d3.select(id + " .enter-mode-bottom")
    .transition()
    .duration(450)
    .attr('opacity', 0);

  // Mode Detail text opacity (triggered at different times)
  if (!d.selected){
    d3.select(id + " .mode-detail").transition().duration(300).attr('opacity', 0);
    force.resume();
  }
}

var dragInitiated = false;
function dragstart(d) {
  if (d.type !== 'mode') return;
  //console.log('DragSTART', d3.event.sourceEvent);
  if (d3.event.sourceEvent.button === 0 && d3.event.sourceEvent.ctrlKey === true) {
    dragInitiated = true;
    d.fixed = true;
  }
}

function drag(d) {
  //console.log('Drag', dragInitiated);
  if (dragInitiated) {
    d.px += d3.event.dx - cloudOffset[0];
    d.py += d3.event.dy - cloudOffset[1];
    d.x += d3.event.dx - cloudOffset[0];
    d.y += d3.event.dy - cloudOffset[1];
    //tick();
  }
}

function dragend(d) {
  //console.log('DragEND', dragInitiated);
  if (d3.event.sourceEvent.button == 0 && dragInitiated) {
    tick();
    dragInitiated = false;
    d.fixed = false;
    force.resume();
  }
}

// Create a circle with the given radius with a matching set of path points
// that can easily be tweened with the coordinates.
function shapeTweenCircle(coordinates, radius) {
  var circle = [],
      length = 0,
      lengths = [length],
      polygon = d3.geom.polygon(coordinates),
      p0 = coordinates[0],
      p1,
      x,
      y,
      i = 0,
      n = coordinates.length;

  // Compute the distances of each coordinate.
  while (++i < n) {
    p1 = coordinates[i];
    x = p1[0] - p0[0];
    y = p1[1] - p0[1];
    lengths.push(length += Math.sqrt(x * x + y * y));
    p0 = p1;
  }

  var area = polygon.area(),
      centroid = polygon.centroid(-1 / (6 * area)),
      angleOffset = -Math.PI / 2, // TODO compute automatically
      angle,
      i = -1,
      k = 2 * Math.PI / lengths[lengths.length - 1];

  // Compute points along the circle’s circumference at equivalent distances.
  while (++i < n) {
    angle = angleOffset + lengths[i] * k;
    circle.push([
      centroid[0] + radius * Math.cos(angle),
      centroid[1] + radius * Math.sin(angle)
    ]);
  }

  return circle;
}

// Convert an array of polygon coords to a closed SVG path D lineto string.
function coordToD(coords) {
  return "M" + coords.join("L") + "Z";
}

// Create any required SVG defines like gradients or filters (referenced by ID).
function buildSVGDefs() {
  d3.selection.prototype.moveToFront = function() {
    return this.each(function(){
      this.parentNode.appendChild(this);
    });
  };

  d3.selection.prototype.moveToBack = function() {
    return this.each(function() {
      var firstChild = this.parentNode.firstChild;
      if (firstChild) {
        this.parentNode.insertBefore(this, firstChild);
      }
    });
  };

  // filters go in defs element
  var defs = svg.append("defs");

  // Create a clipping path for every node
  _.each(graphNodes, function(d){
    if (d.type !== 'mode') return;

    defs.append("clipPath")
      .attr('id', 'clip-' + d.id)
      .attr('transform', 'translate(' + cloudOffset.join() + ')')
      .append('path')
        .attr('class', 'circle')
        .attr('d', coordToD(shapeTweenCircle(cloud, d.radius)));
  });

  // create filter with id #drop-shadow
  // height=130% so that the shadow is not clipped
  var filter = defs.append("filter")
    .attr("id", "drop-shadow")
    .attr("height", "130%");

  // SourceAlpha refers to opacity of graphic that this filter will be applied to
  // convolve that with a Gaussian with standard deviation 3 and store result
  // in blur
  filter.append("feGaussianBlur")
    .attr("in", "SourceAlpha")
    .attr("stdDeviation", 2)
    .attr("result", "blur");

  // translate output of Gaussian blur to the right and downwards with 2px
  // store result in offsetBlur
  filter.append("feOffset")
    .attr("in", "blur")
    .attr("dx", 0)
    .attr("dy", 0)
    .attr("result", "offsetBlur");

  // Set the fill color
  filter.append("feFlood")
    .attr("flood-color", "#FFFFFF")
    .attr("flood-opacity", 1)
    .attr("result", "offsetColor");

  // overlay original SourceGraphic over translated blurred opacity by using
  // feMerge filter. Order of specifying inputs is important!

  filter.append("feComposite")
    .attr('in2', 'offsetBlur')
    .attr('operator', 'in');

  var feMerge = filter.append("feMerge");

  feMerge.append("feMergeNode");
  feMerge.append("feMergeNode")
    .attr("in", "SourceGraphic");

  // Color Desaturation Filter ===============================================
  filter = defs.append("filter")
    .attr("id", "desat")
    .append("feColorMatrix")
      .attr("type", 'matrix')
      .attr("values", '0.3333 0.3333 0.3333 0 0 0.3333 0.3333 0.3333 0 0 0.3333 0.3333 0.3333 0 0 0 0 0 1 0');

  // Bubble highlight filter =================================================
  filter = defs.append("filter")
    .attr("id", "bubble-highlight")
    .attr("height", "200%")
    .attr("width", "200%")
    .attr("x", "-50%")
    .attr("y", "-50%");

  var ce = filter.append("feComponentTransfer").attr("in", 'SourceAlpha');

  ce.append('feFuncA')
    .attr('type', 'table')
    .attr('tableValues', '1 0')

  filter.append("feGaussianBlur")
    .attr("stdDeviation", 8);

  // translate output of Gaussian blur to the right and downwards with 2px
  // store result in offsetBlur
  filter.append("feOffset")
    .attr("dx", 13)
    .attr("dy", 13)
    .attr("result", "offsetBlur");

  // Set the fill color
  filter.append("feFlood")
    .attr("flood-color", "#DDDDFF")
    .attr("flood-opacity", 1)
    .attr("result", "color");

  filter.append("feComposite")
    .attr('in2', 'offsetBlur')
    .attr('operator', 'in');

  filter.append("feComposite")
    .attr('in2', 'SourceAlpha')
    .attr('operator', 'in');

  var feMerge = filter.append("feMerge");

  feMerge.append("feMergeNode")
    .attr("in", "SourceGraphic");
  feMerge.append("feMergeNode");

  // Gradient Def =================================================
  var grad = defs.append("linearGradient")
    .attr("id", "grey-trans")
    .attr("x1", "0%")
    .attr("x2", "0%")
    .attr("y1", "0%")
    .attr("y2", "100%");

  grad.append('stop')
    .attr("stop-color", "#DDD")
    .attr('stop-opacity', 0)
    .attr('offset', 0);

  grad.append('stop')
    .attr("stop-color", "#DDD")
    .attr('stop-opacity', 1)
    .attr('offset', 0.3);
}
