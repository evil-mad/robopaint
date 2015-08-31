/**
 * @file Holds all Robopaint CNCServer specific utility functions, will be
 * available at cncserver.utils.*
 */
var robopaint = window.robopaint;
var cncserver = robopaint.cncserver;

cncserver.utils = {
  // Convert a screen coord to one in the correct format for the API
  getPercentCoord: function(point) {
   return {
     // Remove 1in (96dpi) from total width for WCB margin offsets
     x: (point.x / (cncserver.canvas.width - 96)) * 100,
     y: (point.y / (cncserver.canvas.height - 96)) * 100
   };
  },

  // Convert a strict percent coord to an absolute canvas based one
  getAbsCoord: function(point) {
    var c = robopaint.canvas;
   return {
     // Remove 1/2in (96dpi / 2) from total width for right/bottom offset
     x: (point.x / 100) * (c.width - c.margin.right) ,
     y: (point.y / 100) * (c.height - c.margin.bottom)
   };
  },

  // Convert an absolute steps to a draw coordinate
  getStepstoAbsCoord: function(point) {
    var bot = robopaint.currentBot.data;
    var c = robopaint.canvas;

    // Only work with the WorkArea (coord is absolute in max area)
    var x = (point.x - bot.workArea.left);
    var y = (point.y - bot.workArea.top);

    // Remove margin from total width for right/bottom offset
    var xscale = (c.width - c.margin.width) / (bot.maxArea.width - bot.workArea.left);
    var yscale = (c.height - c.margin.height) / (bot.maxArea.height - bot.workArea.top);

    return {
      // Add back minimum margin from total width for right/bottom offset
      x: parseInt(x * xscale) + c.margin.right,
      y: parseInt(y * yscale) + c.margin.bottom,
    };
  }
};
