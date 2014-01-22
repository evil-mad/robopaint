/**
 * @file Holds all Utility helper functions, must not be linked to anything
 * cncserver specific as every function should be atomic (at least to this file)
 */

robopaint.utils = {
  /**
   * Converts an RGB color value to HSL. Conversion formula
   * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
   * Assumes r, g, and b are contained in the set [0, 255] and
   * returns h, s, and l in the set [0, 1].
   *
   * @param {Array} color
   *   The RGB color to be converted
   * @return {Array}
   *   The HSL representation
   */
  rgbToHSL: function (color){
    if (!color) return false;

    var r = color[0];
    var g = color[1];
    var b = color[2];

    r /= 255, g /= 255, b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;

    if(max == min){
      h = s = 0; // achromatic
    }else{
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch(max){
        case r:h = (g - b) / d + (g < b ? 6 : 0);break;
        case g:h = (b - r) / d + 2;break;
        case b:h = (r - g) / d + 4;break;
      }
      h /= 6;
    }

    return [h, s, l];
  },

  /**
   * Converts an RGB color value to YUV.
   *
   * @param {Array} color
   *   The RGB color array to be converted
   * @return {Array}
   *   The YUV representation
   */
  rgbToYUV: function(color) {
    if (!color) return false;

    var r = color[0];
    var g = color[1];
    var b = color[2];
    var y,u,v;

    y = r *  .299000 + g *  .587000 + b *  .114000
    u = r * -.168736 + g * -.331264 + b *  .500000 + 128
    v = r *  .500000 + g * -.418688 + b * -.081312 + 128

    y = Math.floor(y);
    u = Math.floor(u);
    v = Math.floor(v);

    return [y,u,v];
  },

  /**
   * Converts an RGB string to a HEX string.
   *
   * @param {String} rgb
   *   The RGB color string in the format "rgb(0,0,0)"
   * @return {String}
   *   The string of the converted color, EG "#000000"
   */
  rgbToHex: function(rgb) {
    var c = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    function hex(x) {
      return ("0" + parseInt(x).toString(16)).slice(-2);
    }

    if (c) {
      return "#" + hex(c[1]) + hex(c[2]) + hex(c[3]);
    } else {
      return rgb;
    }

  },

  /**
   * Converts a jQuery rgb or hex color string to a proper array [r,g,b]
   *
   * @param {String} string
   *   The HTML/CSS color string in the format "rgb(0,0,0)" or "#000000"
   * @return {Array}
   *   The color in RGB array format: [0, 0, 0]
   */
  colorStringToArray: function(string) {
    // Quick sanity check
    if (typeof string != 'string') {
      return null;
    }

    // If it's already RGB, use it!
    if (string.indexOf('rgb') !== -1){
      var color = string.slice(4, -1).split(', ');

      $.each(color, function(i, c){
        color[i] = Number(c);
      })

      return color;
    } else if(string.indexOf('#') !== -1) {
      // Otherwise, parse the hex triplet
      // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
      var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
      string = string.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
      });

      var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(string);
      return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
      ] : null;
    } else {
      // If the string doesn't contain "#" or "rgb" then it's outta there!
      return null;
    }

  },

  /**
   * Takes source color and matches it to the nearest color from "colors"
   *
   * @param {Array/String} source
   *   triplet array [r,g,b] or jQuery RGB string like "rgb(0,0,0)"
   * @param {Array} colors
   *   Array of triplet arrays defining up to 7 colors, like [[r,g,b], [r,g,b], ...]
   * @return {Number}
   *   The index in the colors array that best matches the incoming color
   */
  closestColor: function(source, colors){
    if (typeof source == 'string'){
      source = robopaint.utils.colorStringToArray(source);
    }

    // Assume false (white) if null
    if (source == null || isNaN(source[0])){
      source = robopaint.utils.colorStringToArray('#FFFFFF');
    }

    // Convert to YUV to better match human perception of colors
    source = robopaint.utils.rgbToYUV(source);

    var lowestIndex = 0;
    var lowestValue = 1000; // High value start is replaced immediately below
    var distance = 0;
    for (var i=0; i < colors.length; i++){
      var c = colors[i].color.YUV;

      // Color distance finder
      distance = Math.sqrt(
        Math.pow(c[0] - source[0], 2) +
        Math.pow(c[1] - source[1], 2) +
        Math.pow(c[2] - source[2], 2)
      );

      // Lowest value (closest distance) wins!
      if (distance < lowestValue){
        lowestValue = distance;
        lowestIndex = i;
      }
    }
    return lowestIndex;
  },

  /**
   * Pad a string/number with zeros
   *
   * @param {String/Number} str
   *   String or number to be padded out with zeros
   * @param {Number} max
   *   Max number of characters to pad out to
   * @return {String}
   *   The zero padded string
   */
  pad: function(str, max) {
    if (typeof str == "number") str = String(str);
    return str.length < max ? robopaint.utils.pad("0" + str, max) : str;
  },

  /**
   * Add shortcut functions to standard $path selection like transform matrix
   * and point x/y functions.
   *
   * @param {jQuery Object} $path
   *   The selected jQuery DOM object of the path to be appended to
   * @return {null}
   *   $path is modified by object reference directly
   */
  addShortcuts: function($path) {
    $path.transformMatrix = $path[0].getTransformToElement($path[0].ownerSVGElement);
    $path.getPoint = function(distance){ // Handy helper function for gPAL
      var p = this[0].getPointAtLength(distance).matrixTransform(this.transformMatrix);
      // Add 48 to each side for 96dpi 1/2in offset
      return {x: p.x+48, y: p.y+48};
    };
    $path.maxLength = $path[0].getTotalLength(); // Shortcut!
  },

  /**
   * Get the distance between two points... Dude, it's Geometric!!
   *
   * @param {Object/Array} p1
   *   The first point in array or simple object format like [0,0] or {x: 0, y:0}
   * @param {Object/Array} p1
   *   The second point in the same format
   * @return {Number}
   *   The float distance between the two points
   */
  getDistance: function(p1, p2) {
    if (p1.x) {
      p1 = [p1.x, p1.y];
      p2 = [p2.x, p2.y];
    }

    var xdiff = Math.abs(p1[0]-p2[0]);
    var ydiff = Math.abs(p1[1]-p2[1]);
    return Math.sqrt(xdiff*xdiff + ydiff*ydiff);
  },

  /**
   * Move through every path element inside a given context and match its
   * stroke and fill color to a given colorset.
   *
   * @param {Object/String} context
   *   jQuery style context to operate on objects inside of
   * @param {Boolean} recover
   *   Whether or not to set new colors, or recover old colors
   * @param {Array} colors
   *   The colorset array or RGB triplets
   * @param {String} recolorTypes
   *   A jQuery selector of SVG object types to be recolored, defaults to "path"
   * @return {null}
   */
  autoColor: function(context, recover, colors, recolorTypes){
    if (!recolorTypes){
      recolorTypes = "path";
    }

    $(recolorTypes, context).each(function(){
      var i = 0;
      var setColor = "";

      if ($(this).css('fill') !== "none") {
        if (!recover) {
          // Find the closest color
          setColor = $(this).css('fill');
          $(this).data('oldColor', setColor);
          i = robopaint.utils.closestColor(setColor, colors);
          setColor = 'rgb(' + colors[i].color.RGB.join(',') + ')';
        } else {
          // Recover the old color
          setColor = $(this).data('oldColor');
        }

        // Set the new color!
        $(this).css('fill', setColor)
      }

      if ($(this).css('stroke') !== "none") {
        if (!recover) {
          // Find the closest color
          setColor = $(this).css('stroke');
          $(this).data('oldStrokeColor', setColor);
          i = robopaint.utils.closestColor(setColor, colors);
          setColor = 'rgb(' + colors[i].color.RGB.join(',') + ')';
        } else {
          // Recover the old color
          setColor = $(this).data('oldStrokeColor');
        }

        // Set the new color!
        $(this).css('stroke', setColor)
      }
    });
  },

  /**
   * Retreives system IP Addresses via node.js OS calls
   *
   * @param {bool} isLocal
   *   Whether the server is "local only" or not.
   * @return {string}
   *   The text representing the accessible host/s for the server
   */
  getIPs: function(isLocal) {
    if (isLocal) {
      return "localhost";
    } else {
      var os=require('os');
      var ifaces=os.networkInterfaces();
      var out = [];

      for (var dev in ifaces) {
        ifaces[dev].forEach(function(details){
          if (details.family=='IPv4') {
            out.push(details.address);
          }
        });
      }

      return out.join(', ');
    }
  }
};
