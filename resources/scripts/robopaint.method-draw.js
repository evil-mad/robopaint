/**
 * @file Holds all Robopaint specific overrides and JS modifications for Method
 * Draw. Any code here is executed in the space of the subwindow iframe that
 * Method Draw (SVG-edit) runs in.
 */

// Add in the robopaint specific Method Draw css override file
$('<link>').attr({rel: 'stylesheet', href: "../../robopaint.method-draw.css"}).appendTo('head');

// Set the global scope object for any robopaint level details
var robopaint = window.parent.robopaint;

// Page load complete...
$(function() {

  // Fit Controls to the screen size
  responsiveResize();
  $(window).resize(responsiveResize);


  parent.fadeInWindow(); // Trigger iframe window reposition / fade in

  // Parent keypresses push focus to window
  parent.document.onkeydown = function(e) {window.focus();}
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
      methodDraw.canvas.setResolution(robopaint.canvas.width - 48*2, robopaint.canvas.height - 48*2);

      // Set zoom to fit canvas at load
      methodDraw.zoomChanged(window, 'canvas');

      methodDraw.canvas.undoMgr.resetUndoStack();
    }

    // Load last drawing
    if (localStorage["svgedit-default"]) {
      var loadResult = methodDraw.canvas.setSvgString(localStorage["svgedit-default"]);

      // If there's a remote print external callback waiting, trigger it =======
      if (typeof robopaint.api.print.loadCallback === "function") {
        if (loadResult === true) {
          if (!robopaint.api.print.requestOptions.noresize) {
            autoSizeContent(); // Autosize content
          }

          // Pass on the requirement to call the loadCallback to AutoPaint
          robopaint.switchMode('print'); // Load autopaint
        } else {
          robopaint.api.print.loadCallback({
            status: 'failure',
            error: loadResult
          });
        }
      }

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
    try {
      // Remove unwanted elements~~~~~~~~~~~~
      $('#svgcontent title').remove() // Get rid of titles!

      // Save the top level group objects before moving elements...
      var $topGroups = $('#svgcontent>g');

      // Move all SVG child elements to SVG root
      $('#svgcontent>g:last').children().appendTo('#svgcontent');
      $topGroups.remove(); // Remove editor groupings

      // Convert elements that don't play well with robopaint's handlers
      var $elems = $('circle, ellipse, line, polyline', '#svgcontent');
      console.log('Converting ' + $elems.length + ' elements into paths for printing...');
      $elems.each(function(){
        methodDraw.canvas.convertToPath(this);
      });

      // Reset orientation so paths have a more accessible BBox
      $elems = $('path','#svgcontent');
      console.log('Resetting path orientation for ' + $elems.length + ' paths for printing...');
      $elems.each(function(){
        methodDraw.canvas.pathActions.resetOrientation(this)
      });
    } catch(e) {
      console.log(e);

      // If there's an external callback waiting, trigger the error
      if (typeof robopaint.api.print.loadCallback === "function") {
        robopaint.api.print.loadCallback({
          status: 'failure',
          error: e
        });
      } else {
        return("Oops! Looks like there are some errors in your SVG that RoboPaint couldn't automatically fix. \n\n We suggest you open the SVG in Inkscape or another SVG editor, simplify the document or just resave it. \n\n You can continue and try to print this, but you may have issues. Error given below: \n\n\n" + e.message);
      }
    }

    window.localStorage.setItem('svgedit-default', methodDraw.canvas.svgCanvasToString());
  };

})

// Remove all the Method Draw components we don't want
function removeElements() {
  $('#canvas_panel>*, #tool_blur, #menu_bar>a, #tool_text').remove();
  $('#tool_snap, #view_grid, #rect_panel label, #path_panel label').remove();
  $('#g_panel label, #ellipse_panel label, #line label').remove();
  $('#text_panel label').remove();
  $('#tool_export').remove();
  $('#palette').hide();
}


// Add in extra Method Draw elements
function addElements() {
  if (!robopaint.statedata.lastFile) robopaint.statedata.lastFile = '';

  // Add NW integrated save functionality
  var fileSave = $('<input>').attr({
    type: 'file',
    nwsaveas: robopaint.statedata.lastFile
  });

  methodDraw.setCustomHandlers({
    save: function(win, svg) {
      fileSave.change(function(e) {
        var path = this.value;

        if (!path) return; // Cancelled!

        // Verify .svg extension
        if (path.split('.').pop().toLowerCase() !== 'svg') {
          path += '.svg';
        }

        // Clean out lines 2-6 (& 8) (if existing)
        var lines = svg.split("\n");
        var backTitle = "  <title>background</title>";
        if (lines[4] == backTitle || lines[3] == backTitle) {

          var offset = lines[4] == backTitle ? 1 : 0;
          var out = [];
          for(var i in lines) {
            var skip = false;

            var skipRules = [
              i < 6 + offset && i > 0,
              i == 7 + offset
            ];

            for (var s in skipRules) {
              skip = skip ? skip : skipRules[s];
            }

            if (!skip) {
              out.push(lines[i]);
            }
          }
          svg = out.join("\n");
        }

        try {
          window.parent.fs.writeFileSync(path, svg);
          robopaint.statedata.lastFile = path;
          $(this).attr('nwsaveas', path);
        } catch(e) {
          window.alert('There was an error writing the file. \n\n Check your permissions or file name and try again. \n\n ERR# ' + err.errno + ',  Code: ' + err.code);
          console.log('Error saving file:', err);
        }
      }).click();
    }
  });




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

 // Add Autocolor button
 var recover = false;

 // jQuery selector list of objects to recolor
 var types = 'path, rect:not(#canvas_background), circle, ellipse, line, polygon';
 $('#tools_bottom_3').append(
   $('<button>')
     .attr({id:"auto-color", title:"Pick the closest match for existing colors in the drawing. Click again to UNDO."})
     .text('Auto Color')
     .click(function(){
       robopaint.utils.autoColor($('#svgcontent'), recover, robopaint.colors, types);
       recover = !recover;
     })
 );

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
  for(var i in robopaint.statedata.colorsets['ALL']) {
    var set = robopaint.statedata.colorsets['ALL'][i];
    $('<link>').attr({rel: 'stylesheet', href: '../../colorsets/' + set + '/' + set + '.css'}).appendTo('head');
  }

  updateColorSet();
}

// Update the rendering of the color set when it changes, called from main.js
function updateColorSet(){
  var set = robopaint.statedata.colorsets[robopaint.settings.colorset];
  robopaint.colors = set.colors; // Update shortcut
  $('#colors').attr('class', '').addClass(set.baseClass);
  for (var i in set.colors) {
    $('#color' + i)
      .text(robopaint.settings.showcolortext ? set.colors[i].name : "")
      .attr('title', robopaint.settings.showcolortext ? "" : set.colors[i].name);
  }
}

// Bind the click event for each color
function bindColorSelect() {
  $('#colors .color, #colors .static div').click(function(e){
    var isStroke = $('#tool_stroke').hasClass('active');
    var picker = isStroke ? "stroke" : "fill";
    var color = robopaint.utils.rgbToHex($(this).css('background-color'));
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

// Triggered on before close or switch mode, call callback to complete operation
function onClose(callback, isGlobal){
  if (isGlobal && !robopaint.settings.openlast && methodDraw.canvas.undoMgr.getUndoStackSize() > 0) {
    var r = confirm("Are you sure you want to quit?\n\
Your changes to this image will not be saved before printing. Click Ok to Quit.");
    if (r == true) {
      callback(); // Close/continue
    }
  } else {
    callback();
  }
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

// Resize specific controls to match window requirements not easily done with CSS
function responsiveResize() {
  var h = $(window).height();
  $('#tools_top').height(h-61);
}
