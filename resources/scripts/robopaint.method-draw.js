/**
 * @file Holds all Robopaint specific overrides and JS modifications for Method
 * Draw. Any code here is executed in the space of the subwindow iframe that
 * Method Draw (SVG-edit) runs in.
 */

// Add in the robopaint specific Method Draw css override file
$('<link>').attr({rel: 'stylesheet', href: "../../robopaint.method-draw.css"}).appendTo('head');

var statedata = window.parent.statedata;
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
      methodDraw.canvas.addToSelection($('#svgcontent>g:nth-child(3)>g'));
      methodDraw.canvas.ungroupSelectedElement();
      methodDraw.canvas.clearSelection();
    }

    // Load last drawing
    if (localStorage["svgedit-default"]) {
      methodDraw.canvas.setSvgString(localStorage["svgedit-default"]);
    } else {
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
  $('#canvas_panel, #tool_blur, #menu_bar>a, #tool_text').remove();
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

  // Add in the Watercolor Palette
  $('#tools_bottom_3').append(buildPalette());
  loadColorsets();
  bindColorSelect();

}

// Build out the DOM elements for the watercolor eyedropper selection palette
function buildPalette(){
  var $main = $('<div>').addClass('palette_robopaint').attr('id', 'colors');

  $main.append(
    $('<select>').attr('id', 'colorsets')
  );


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
    var id = statedata.colorsets['ALL'][i];
    var set = statedata.colorsets[id];
    $('<option>')
      .val(id)
      .text(set.name)
      .appendTo('#colorsets');
    $('head').append(set.stylesheet);
  }

  // Bind change for colors
  $('#colorsets').change(function(){
    var id = $(this).val();
    statedata.colorset = id;
    var set = statedata.colorsets[id];
    $('#colors').attr('class', '').addClass(set.baseClass);
    for (var i in set.colors) {
      $('#color' + i).attr('title', set.colors[i]);
    }
    setTimeout(cacheColors, 500);
  }).val(statedata.colorset).change();
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
