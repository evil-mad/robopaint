global.$ = $;

var cncserver = require('cncserver');
var fs = require('fs');

var svgs = fs.readdirSync('resources/svgs');


/*cncserver.start({
  success: {

  }
});
*/

// Document Ready...
$(function() {

  $('<iframe>').attr({
    src: 'resources/print.html',
    width: '700',
    height: '600',
    border: 0
  }).appendTo('body');

  /*
  // Load in SVG files for quick loading
  if (svgs.length > 0) {
    $('#loadlist').html('');
    for(var i in svgs) {
      var s = svgs[i];
      var name = s; // Will make this more readable later :P
      $('<li>').append(
        $('<a>').text(name).data('file', s).attr('href', '#')
      ).appendTo('#loadlist');
    }
  }
  */
})

