/**
 * @file Holds all Robopaint media / color set related loading, parsing, etc
 * functionality.
 */
/* globals _, window */
var robopaint = window.robopaint;
var fs = require('fs-plus');

robopaint.media = {
  /**
   * Fetches all colorsets available from the colorsets dir
   */
  load: function() {
    // TODO: Move this from colorsets to mediasets
    var colorsetDir = robopaint.appPath + 'resources/colorsets/';
    var files = fs.readdirSync(colorsetDir);
    var sets = [];

    // List all files, only add directories
    for(var i in files) {
      if (fs.statSync(colorsetDir + files[i]).isDirectory()) {
        sets.push(files[i]);
      }
    }

    this.sets = {};

    // Save a universal white for color comparisons.
    robopaint.media.white = robopaint.media.getColorsetColor(
      '#FFFFFF', 'white'
    );

    // Move through each colorset JSON definition file...
    _.each(sets, function(set) {
      var setDir = colorsetDir + set + '/';
      var fileSets = {};

      try {
        fileSets = require(setDir + set + '.json');
      } catch(e) {
        // Silently fail on bad parse!
        return;
      }

       // Move through all colorsets in file
      _.each(fileSets, function(fileSet, fileSetKey) {
        var machineName = fileSet.machineName;
        var colorsOut = [];

        try {
          // Process Colors to avoid re-processing later
          _.each(fileSet.colors, function(color){
            var name = Object.keys(color)[0];
            colorsOut.push(robopaint.media.getColorsetColor(color[name], name));
          });
        } catch(e) {
          console.error("Parse error on colorset: " + fileSetKey, e);
          return;
        }

        // Use the machine name and set name of the colorset to create translate
        // strings.
        var name  = "colorsets." + set + "." + machineName + ".name";
        var maker = "colorsets." + set + "." + machineName + ".manufacturer";
        var desc  = "colorsets." + set + "." + machineName + ".description";
        var media = "colorsets.media." + fileSet.media;

        robopaint.media.sets[machineName] = {
          name: robopaint.t(name),
          type: robopaint.t(maker),
          weight: parseInt(fileSet.weight),
          description: robopaint.t(desc),
          media: robopaint.t(media),
          enabled: robopaint.currentBot.allowedMedia[fileSet.media],
          baseClass: fileSet.styles.baseClass,
          colors: colorsOut,
          styleSrc: setDir + fileSet.styles.src
        };
      });
    });

    this.setOrder = Object.keys(robopaint.media.sets).sort(function(a, b) {
      return (robopaint.media.sets[a].weight - robopaint.media.sets[b].weight);
    });
  },

  // Get the colorset color object for a HEX color and machine name.
  getColorsetColor: function(colorHex, name) {
    var colorRGB = robopaint.utils.colorStringToArray(colorHex);
    return {
      name: robopaint.t("colorsets.colors." + name),
      key: name,
      color: {
        HEX: colorHex,
        RGB: colorRGB,
        HSL: robopaint.utils.rgbToHSL(colorRGB),
        YUV: robopaint.utils.rgbToYUV(colorRGB),
      }
    };
  },

  // Add a stylesheet for the given media set to the page
  // TODO: fully document
  addStylesheet: function(setName) {
    if (!setName) setName = robopaint.media.currentSet.baseClass;
    if (!robopaint.media.sets[setName]) return false;

    robopaint.utils.addStylesheet(robopaint.media.sets[setName].styleSrc);
    return true;
  },

  // Always return the current media set, as defined in robopaint.settings
  get currentSet() {
    if (!this.sets) this.load();

    // If the saved set doesn't exist anymore, default to generic.
    if (!this.sets[robopaint.settings.colorset]) {
      robopaint.settings.colorset = 'generic';
    }
    return this.sets[robopaint.settings.colorset];
  },

  // Returns a list of the current mediaset tools, sorted by luminosty, or Y val
  sortedColors: function() {
    var colorsort = [];

    // Use JS internal sort by slapping a zero padded value into an array
    _.each(robopaint.media.currentSet.colors, function(color, index){
      colorsort.push(
        robopaint.utils.pad(color.color.YUV[0], 3) + '|' + 'color' + index
      );
    });
    colorsort.sort().reverse();

    // Now extract the luminostiy from the array, and leave a clean color list.
    for(var i in colorsort){
      colorsort[i] = colorsort[i].split('|')[1];
    }

    // Add "water2" tool last (if available)
    if (typeof robopaint.currentBot.data.tools.water2 !== 'undefined') {
      colorsort.push('water2');
    }

    return colorsort;
  },
};
