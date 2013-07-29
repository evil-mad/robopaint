/**
 * @file Holds all Robopaint specific overrides and JS modifications for Method
 * Draw. Any code here is executed in the space of the subwindow iframe that
 * Method Draw (SVG-edit) runs in.
 */

// Add in the robopaint specific Method Draw css override file
$('<link>').attr({rel: 'stylesheet', href: "../../robopaint.method-draw.css"}).appendTo('head');

var statedata = window.parent.statedata;
var settings = window.parent.settings;
var cache = {};

// Only for using the color conversion utilities
var cncserver = {config: {}};
$('<script>').attr({type: 'text/javascript', src: "../../scripts/cncserver.client.utils.js"}).appendTo('head');

// Page load complete...
$(function() {
  parent.fadeInWindow(); // Trigger iframe window reposition / fade in

  // Parent keypresses push focus to window
  parent.document.onkeydown = function(e) { window.focus();}
  window.focus() // Set window focus (required for keyboard shortcuts)

  // Remove elements we don't want =============================================
  removeElements();

  // Add new elements!
  addElements();

  // Drawing Canvas Ready ======================================================
  methodDraw.ready(function(){

    // Drawing has been opened =================================================
    methodDraw.openCallback = function() {
      // Force the resolution to match what's expected
      methodDraw.canvas.setResolution(1056,768);

      // Set zoom to fit canvas at load
      methodDraw.zoomChanged(window, 'canvas');

      // Ungroup the elements that were just forced into a group :/
      methodDraw.canvas.selectAllInCurrentLayer();
      methodDraw.canvas.ungroupSelectedElement();
      methodDraw.canvas.clearSelection();

      methodDraw.canvas.undoMgr.resetUndoStack();
    }

    // Load last drawing
    if (localStorage["svgedit-default"]) {
      methodDraw.canvas.setSvgString(localStorage["svgedit-default"]);
    } else {
      methodDraw.canvas.undoMgr.resetUndoStack();
      // Set zoom to fit empty canvas at init
      methodDraw.zoomChanged(window, 'canvas');
    }

    var zoomTimeout = 0;
    $(window).resize(function(){
      if (zoomTimeout) {
        clearTimeout(zoomTimeout);
      }
      zoomTimeout = setTimeout(function(){
        methodDraw.zoomChanged(window, 'canvas');
        window.focus()
      }, 250);
    });
  });

  // Method Draw Closing / Switching ===========================================
  window.onbeforeunload = function (){
    // Remove unwanted elements
    $('#svgcontent title').remove()

    if ($('#svgcontent g').length > 1) {
      $('#svgcontent g:first').remove();
    }

    // Convert elements that don't play well with robopaint's handlers
    $('circle, ellipse, rect','#svgcontent').each(function(){
      if (this.tagName == "rect"){
        // Don't convert non-rounded corner rectangles
        if (!$(this).attr('rx')) return;
      }

      methodDraw.canvas.convertToPath(this);
    });

    window.localStorage.setItem('svgedit-default', methodDraw.canvas.svgCanvasToString());
  };

})

// Remove all the Method Draw components we don't want
function removeElements() {
  $('#canvas_panel>*, #tool_blur, #menu_bar>a, #tool_text').remove();
  $('#tool_snap, #view_grid, #rect_panel label, #path_panel label').remove();
  $('#g_panel label, #ellipse_panel label, #line label').remove();
  $('#text_panel label').remove();
  $('#tool_save, #tool_export').remove(); // Save and export, they shall return!
  $('#palette').hide();
}


// Add in extra Method Draw elements
function addElements() {
  // Add and bind Auto Zoom Button / Menu item
  $('#zoom_panel').before(
    $('<button>').addClass('zoomfit zoomfitcanvas')
      .data('zoomtype', 'canvas')
      .attr('title', 'Zoom to fit canvas')
      .text('Zoom to Fit')
  );

  $('#view_menu .separator').after(
    $('<div>').addClass('menu_item zoomfit')
      .data('zoomtype', 'canvas')
      .text('Fit Canvas in Window'),
    $('<div>').addClass('menu_item zoomfit')
      .data('zoomtype', 'content')
      .text('Fit Content in Window'),
    $('<div>').addClass('separator')
  );

  $('.zoomfit').click(function(){
    methodDraw.zoomChanged(window, $(this).data('zoomtype'));
  })

  // Add in easy rotate button
  $('<label>')
  .attr({id: 'tool_rotate', 'data-title': "Rotate Left"})
  .addClass('draginput')
  .append(
    $('<span>').addClass('icon_label').html("Rotate Left"),
    $('<div>').addClass('draginput_cell')
      .attr({id: 'rotate', title: 'Rotate Left'})
      .click(function(){
        var a = methodDraw.canvas.getRotationAngle();

        a = a - 90; // Rotate left!

        // Flop angle to positive if past -180
        if (a < -180) a = a + 360;

         methodDraw.canvas.setRotationAngle(a);
      })
  ).prependTo('#selected_panel');

  // Add auto-sizer button
  $('#canvas_panel').append(
    $('<h4>').addClass('clearfix').text('Global'),
    $('<label>')
      .attr({id: 'tool_autosize', 'data-title': "Fit Content"})
      .addClass('draginput')
      .append(
        $('<span>').addClass('icon_label').html("Fit Content"),
        $('<div>').addClass('draginput_cell')
          .attr({id: 'autosize', title: 'Auto Size content to fit canvas'})
          .click(function(){
            autoSizeContent();
          })
      )
  );

  // Add in the Watercolor Palette
  $('#tools_bottom_3').append(buildPalette());
  loadColorsets();
  bindColorSelect();

}

// Build out the DOM elements for the watercolor eyedropper selection palette
function buildPalette(){
  var $main = $('<div>').addClass('palette_robopaint').attr('id', 'colors');

  for(var i = 0; i < 8; i++) {
    $main.append(
      $('<div>').addClass('palette_item color').attr('id', 'color' + i)
    );
  }

  $main.append(
    $('<div>').addClass('static palette_item').append(
      $('<div>')
        .attr('title', 'Transparent')
        .attr('id', 'colorx').text('X'),
      $('<div>')
        .attr('title', 'White / Paper')
        .attr('id', 'colornone')
    )
  );

  return $main;
}

// Load in the colorset data
function loadColorsets() {
  for(var i in statedata.colorsets['ALL']) {
    var set = statedata.colorsets[statedata.colorsets['ALL'][i]];
    $('head').append(set.stylesheet);
  }

  updateColorSet();
}

function updateColorSet(){
  var set = statedata.colorsets[settings.colorset];
  $('#colors').attr('class', '').addClass(set.baseClass);
  for (var i in set.colors) {
    $('#color' + i)
      .text(settings.showcolortext ? set.colors[i] : "")
      .attr('title', settings.showcolortext ? "" : set.colors[i]);
  }
  setTimeout(cacheColors, 500);
}

// Cache the current colorset config for measuring against as HSL
function cacheColors() {
  cncserver.config.colors = [];
  cncserver.config.colorsYUV = [];

  // Check to see if CSS is loaded...
  var colorTest = $('#color0').css('background-color');
  if (colorTest == "transparent" || colorTest == "rgba(0, 0, 0, 0)") {
    setTimeout(cacheColors, 500);
    console.info('css still loading...');
    return;
  }

  $('#colors .color').each(function(){
    cncserver.config.colors.push(
      cncserver.utils.colorStringToArray($(this).css('background-color'))
    );
  });
  // Also add white paper for near-white color detection
  cncserver.config.colors.push([255,255,255]);

  // Add cached YUV conversions for visual color matching
  $.each(cncserver.config.colors, function(i, color){
    cncserver.config.colorsYUV.push(cncserver.utils.rgbToYUV(color));
  });
}

// Bind the click event for each color
function bindColorSelect() {
  $('#colors .color, #colors .static div').click(function(e){
    var isStroke = $('#tool_stroke').hasClass('active');
    var picker = isStroke ? "stroke" : "fill";
    var color = cncserver.utils.rgbToHex($(this).css('background-color'));
    var paint = null;
    var noUndo = false;

    // Webkit-based browsers returned 'initial' here for no stroke
    if (color === 'transparent' || color === 'initial' || color === '#none') {
      color = 'none';
      paint = new $.jGraduate.Paint();
    }
    else {
      paint = new $.jGraduate.Paint({alpha: 100, solidColor: color.substr(1)});
    }

    methodDraw.paintBox[picker].setPaint(paint);

    methodDraw.canvas.setColor(picker, color, noUndo);

    if (isStroke) {
      if (color != 'none' && svgCanvas.getStrokeOpacity() != 1) {
        svgCanvas.setPaintOpacity('stroke', 1.0);
      }
    } else {
      if (color != 'none' && svgCanvas.getFillOpacity() != 1) {
        svgCanvas.setPaintOpacity('fill', 1.0);
      }
    }
  });
}

// Takes all content and ensures it's centered and sized to fit exactly within
// the drawing canvas, big or small.
function autoSizeContent() {
  methodDraw.canvas.selectAllInCurrentLayer();
  methodDraw.canvas.groupSelectedElements();
  var box = methodDraw.canvas.getBBox($('#selectedBox0')[0]);
  var c = {w: $('#svgcontent').attr('width'), h: $('#svgcontent').attr('height')};
  var margin = 5;
  var scale = 1;
  var z = methodDraw.canvas.getZoom();

  var xscale = (c.w - margin) / box.width;
  var yscale = (c.h - margin) / box.height;

  scale = xscale > yscale ? yscale : xscale; // Chose the smaller of the two.

  // Center offsets
  var x = ((c.w/2 - ((box.width*scale)/2)) - box.x) / z;
  var y = ((c.h/2 - ((box.height*scale)/2)) - box.y) / z;

  // When scaling, SVG moves the top left corner of the path closer and further
  // away from the root top left corner, this is ot offset for that separately
  var sx = (box.x*(1-scale)) / z;
  var sy = (box.y*(1-scale)) / z;

  var $e = $(methodDraw.canvas.getSelectedElems()[0]);
  $e.attr('transform', 'translate(' + (x+sx) + ',' + (y+sy) + ') scale(' + scale + ')');

  // Ungroup, and clear selection.. as if nothing had happened!
  methodDraw.canvas.ungroupSelectedElement();
  methodDraw.canvas.clearSelection();
}
