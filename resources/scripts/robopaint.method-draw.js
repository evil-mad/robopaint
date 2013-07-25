/**
 * @file Holds all Robopaint specific overrides and JS modifications for Method
 * Draw. Any code here is executed in the space of the subwindow iframe that
 * Method Draw (SVG-edit) runs in.
 */

// Add in the robopaint specific Method Draw css override file
$('head').append('<link rel="stylesheet" href="../../robopaint.method-draw.css" type="text/css" />');

// Page load complete...
$(function() {
  parent.fadeInWindow(); // Trigger iframe window reposition / fade in

  // Parent keypresses push focus to window
  parent.document.onkeydown = function(e) { window.focus();}
  window.focus() // Set window focus (required for keyboard shortcuts)

  // Remove elements we don't want =============================================
  $('#canvas_panel, #tool_blur, #menu_bar>a, #tool_text').remove();
  $('#tool_snap, #view_grid, #rect_panel label, #path_panel label').remove();
  $('#g_panel label, #ellipse_panel label, #line label').remove();
  $('#text_panel label').remove();
  $('#tool_save, #tool_export').remove(); // Save and export, they shall return!


  // Drawing Canvas Ready ======================================================
  methodDraw.ready(function(){

    // Load last drawing
    if (localStorage["svgedit-default"]) {
      methodDraw.canvas.setSvgString(localStorage["svgedit-default"]);
    }

    methodDraw.openCallback = function() {
      // Force the resolution to match what's expected
      methodDraw.canvas.setResolution(1056,768);

      // Set zoom to fit canvas at load
      methodDraw.zoomChanged(window, 'canvas');
    }

    methodDraw.zoomChanged(window, 'canvas');

    // Add and bind Auto Zoom Button
    $('#zoom_panel').before(
      $('<button>').addClass('zoomfit').click(function(){
        methodDraw.zoomChanged(window, 'canvas');
      }).attr('title', 'Zoom to fit canvas').text('Auto')
    );

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
