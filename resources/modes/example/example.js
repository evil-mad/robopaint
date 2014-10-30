/**
 * @file Holds all RoboPaint example mode text renderer initialization code
 */

robopaintRequire(['hersheytext', 'svgshared', 'wcb', 'commander'],
function($, robopaint, cncserver) {

  // We don't ever check visibility/overlap for this mode because the
  // text output is fully linear and only lines
  cncserver.config.checkVisibility = false;

// On page load complete...
$(function() {
  // Fit the canvas and other controls to the screen size
  responsiveResize();
  setTimeout(responsiveResize, 500);
  $(window).resize(responsiveResize);

  // Populate font choices
  for (var id in cncserver.fonts) {
    $('<option>').text(cncserver.fonts[id].name).val(id).appendTo('#fontselect');
  }

  // Externally accessible bind controlls trigger for robopaint.mode.svg to call
  window.bindControls = function() {
    // Bind trigger for font selection
    $('#fontselect').change(function(){
      $('#textexample').remove(); // Kill the old one (if any)

      // Render some text into the SVG area with it
      cncserver.renderText($('#fonttext').val(), {
        font: cncserver.fonts[$(this).val()],
        pos: {x: 0, y: 0},
        scale: parseInt($('#scale').val()) / 100,
        charWidth: parseInt($('#charwidth').val()),
        wrapWidth: parseInt($('#wrap').val()),
        centerWidth: parseInt($('#hcenter').val()),
        centerHeight: parseInt($('#vcenter').val()),
        target: '#target',
        id: 'textexample'
      });

      // REQUIRED: Refresh DOM to reinstate node status with XML namespaces
      // TODO: There must be a better way to do this! :P
      $('#scale-container').html($('#scale-container').html());
    }).val('futural').change(); // Trigger initial run (and default font)

    // Re-render on keypress/change
    $('input').on('input change', function(e){
      $('#fontselect').change();
    });

    // Bind save functionality
    $('#save').click(function() {
      cncserver.canvas.saveSVG($('#export').html());
    });

    // Bind print functionality
    $('#print').click(function() {
      $('#save').click();
      robopaint.switchMode('print');
    });
  }

  // Externalize for remote triggering
  window.responsiveResize = responsiveResize;
  function responsiveResize(){
     var w = $(window).width();
    var h = $(window).height();

    // These value should be static, set originally from central canvas config
    var mainOffset = {
      top: 30,
      left: 30,
      bottom: 40,
      right: $('#control').width() + 50
    };

    // Calculate scale for both width and height...
    var scale = {
      x: (w - (mainOffset.left + mainOffset.right)) / cncserver.canvas.width,
      y: (h - (mainOffset.top + mainOffset.bottom)) / cncserver.canvas.height
    }

    // ...use the smaller of the two
    cncserver.canvas.scale = scale.x < scale.y ? scale.x : scale.y;

    $('#scale-container') // Actually do the scaling
      .css('-webkit-transform', 'scale(' + cncserver.canvas.scale + ')');

    cncserver.canvas.offset.left = mainOffset.left+1;
    cncserver.canvas.offset.top = mainOffset.top+1;
  }

}); // End Page load complete

}); // End RequireJS init
