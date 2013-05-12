global.$ = $;

var cncserverNode = require('cncserver');
var fs = require('fs');

var svgs = fs.readdirSync('resources/svgs');

$(function() {

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
})

