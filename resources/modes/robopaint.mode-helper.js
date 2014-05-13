/**
 * @file RoboPaint mode helper functions!
 *
 * Include this file in your RoboPaint Mode to have it load shared resources
 * for you! And some other stuff.
 */

var rpHelperFiles = {
  jquery: 'lib/jquery.js'
};

// robopaintHelper.include(['jquery', 'svg', 'svgdom', 'paths', ]);

robopaintHelper = {
  include: function(files) {
    var h = document.getElementsByTagName('head')[0];
    for(var i in files) {
      if (rpHelperFiles[files[i]]) {
        var s = document.createElement('script');
        s.type = 'text/javascript';
        s.src = '../../scripts/' + rpHelperFiles[files[i]];
        h.appendChild(s);
      }
    }
  }
};