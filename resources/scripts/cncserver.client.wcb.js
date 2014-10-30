/**
 * @file Holds all Robopaint watercolorbot specific configuration and utility
 * functions in AMD Module format for inclusion via RequireJS.
 */

define(function(){return function($, robopaint, cncserver){
cncserver.wcb = {
  // Set the current status message
  status: function(msg, st) {

    var $status = $('#statusmessage');
    var classname = 'wait';

    // String messages, just set em
    if (typeof msg == "string") {
      $status.html(msg);
    } else if (Object.prototype.toString.call(msg) == "[object Array]") {
      // If it's an array, flop the message based on the status var

      // If there's not a second error message, default it.
      if (msg.length == 1) msg.push('Connection Problem &#x2639;');

      $status.html((st == false) ? msg[1] : msg[0]);
    }

    // If stat var is actually set
    if (typeof st != 'undefined') {
      if (typeof st == 'string') {
        classname = st;
      } else {
        classname = (st == false) ? 'error' : 'success'
      }

    }

    $status.attr('class', classname); // Reset class to only the set class
  },

  // Grouping function to do a full wash of the brush
  fullWash: function(callback, useDip, fromSendBuffer) {
    var toolExt = useDip ? 'dip' : '';

    switch(parseInt(robopaint.settings.penmode)) {
      case 3:
      case 2: // Dissallow water
        cncserver.wcb.status('Full wash command ignored for draw mode ' + robopaint.settings.penmode);
        if (callback) callback(true);
        break;
      default:
        cncserver.cmd.run([
          ['status', 'Doing a full brush wash...'],
          'resetdistance',
          ['tool', 'water0' + toolExt],
          ['tool', 'water1' + toolExt],
          ['tool', 'water2' + toolExt],
          ['status', 'Brush should be clean'],
        ], fromSendBuffer);
        /**
         * The 'fromSendBuffer' at the end here will run this set of commands
         * into the TOP of the send buffer IF the fullwash command came from a
         * run command, because otherwise these new run commands might be added
         * to the bottom AFTER some other commands. This in effect simply
         * replaces the one "wash" command with the 6 commands above :)
         *
         * We use the passed variable "fromSendBuffer", so that implementors can
         * still call the function directly and have the immediate effect of
         * simply adding these commands to the sendBuffer.
         */

        if (callback) callback(true);

        // TODO: Hmm... this should probably be set via stream update :/
        cncserver.state.media = 'water0';
    }
  },

  // Get the name of paint/water/media on the brush
  getMediaName: function(toolName) {
    if (typeof toolName != 'string') toolName = cncserver.state.media;

    if (toolName.indexOf('water') !== -1) {
      return "Water";
    } else {
      return cncserver.config.colors[toolName.substr(5, 1)].name;
    }
  },

  // Wrapper for toolchange to manage pen mode logic
  setMedia: function(toolName, callback, fromSendBuffer){
    var name = cncserver.wcb.getMediaName(toolName).toLowerCase();
    var mode = parseInt(robopaint.settings.penmode);

    // Water change
    if (name == "water") {
      switch(mode) {
        case 3: // Dissallow all
        case 2: // Dissallow water
          cncserver.wcb.status('Water ignored for draw mode ' + mode);
          if (callback) callback(true);
          return;
      }
    } else { // Color Change
      switch(mode) {
        case 3: // Dissallow all
        case 1: // Dissallow paint
          cncserver.wcb.status('Paint ignored for draw mode ' + mode);
          if (callback) callback(true);
          return;
      }
    }

    // If we've gotten this far, we can make the change!

    // Save the targeted media (separate from media state)
    cncserver.state.mediaTarget = toolName;

    // Visually show the selection
    var idName = toolName.indexOf('dip') !== -1 ? toolName.slice(0, -3) : toolName;
    $('nav#tools a.selected').removeClass('selected');
    $('nav#tools #' + idName).addClass('selected');

    cncserver.cmd.run([
      ['status', 'Putting some ' + name + ' on the brush...'],
      'resetdistance',
      ['tool', toolName],
      ['status', 'There is now ' + name + ' on the brush']
    ], fromSendBuffer);

    if (callback) callback();
  },

  // Convert a screen coord to one in the correct format for the API
  getPercentCoord: function(point) {
    return {
      // Remove 1in (96dpi) from total width for WCB margin offsets
      // TODO: Base this off BOT specific margin setting
      x: (point.x / (cncserver.canvas.width - 96)) * 100,
      y: (point.y / (cncserver.canvas.height - 96)) * 100
    };
  },

  // Convert a strict percent coord to an absolute canvas based one
  getAbsCoord: function(point) {
    return {
      // Remove 1/2in (96dpi / 2) from total width for right/bottom offset
      x: (point.x / 100) * (cncserver.canvas.width - 48) ,
      y: (point.y / 100) * (cncserver.canvas.height - 48)
    };
  },

  // Convert an absolute steps to a draw coordinate
  getStepstoAbsCoord: function(point) {
    var bot = robopaint.currentBot.data;

    // Only work with the WorkArea (coord is absolute in max area)
    var x = (point.x - robopaint.currentBot.data.workArea.left);
    var y = (point.y - robopaint.currentBot.data.workArea.top);

    // Remove 1/2in (96dpi / 2) from total width for right/bottom offset
    var xscale = (cncserver.canvas.width - 48*2) / (bot.maxArea.width - bot.workArea.left);
    var yscale = (cncserver.canvas.height - 48*2) / (bot.maxArea.height - bot.workArea.top);

    return {
      // Add back minimum 1/2in (96dpi / 2) from total width for right/bottom offset
      x: parseInt(x * xscale) + 48,
      y: parseInt(y * yscale) + 48,
    };
  },

  // Wet the brush and get more of targeted media, then return to
  // point given and trigger callback
  getMorePaint: function(point, callback) {
    var name = cncserver.wcb.getMediaName(cncserver.state.mediaTarget).toLowerCase();

    // Reset the counter for every mode on getMorePaint
    robopaint.cncserver.api.pen.resetCounter();

    // Change what happens here depending on penmode
    switch(parseInt(robopaint.settings.penmode)) {
      case 1: // Dissallow paint
        cncserver.cmd.run([
          ['status', 'Going to get some more water...'],
          'resetdistance',
          ['media', 'water0'],
          'up',
          ['move', point],
          ['status', 'Continuing to paint with water'],
          'down'
        ], true); // Add to the start (not the end) of the local buffer
        if (callback) callback();

        break;
      case 2: // Dissallow water
        cncserver.cmd.run([
          ['status', 'Going to get some more ' + name + ', no water...'],
          'resetdistance',
          ['media', cncserver.state.mediaTarget],
          'up',
          ['move', point],
          ['status', 'Continuing to paint with ' + name],
          'down'
        ], true); // Add to the start (not the end) of the local buffer

        if (callback) callback();

        break;
      case 3: // Dissallow All
        // Get paint ignored for draw mode 3
        if (callback) callback(true);
        break;
      default:
        cncserver.cmd.run([
          ['status', 'Going to get some more ' + name + '...'],
          'resetdistance',
          ['media', 'water0dip'],
          ['media', cncserver.state.mediaTarget],
          'up',
          ['move', point],
          ['status', 'Continuing to paint with ' + name],
          'down'
        ], true); // Add to the start (not the end) of the local buffer

        if (callback) callback();
    }
  },

  // Returns a list of the current colorset, sorted by luminosty, or Y value
  sortedColors: function() {
    var colorsort = [];

    // Use JS internal sort by slapping a zero padded value into an array
    $.each(cncserver.config.colors, function(index, color){
      if (index != 8) { // Ignore white
        colorsort.push(robopaint.utils.pad(color.color.YUV[0], 3) + '|' + 'color' + index);
      }
    });
    colorsort.sort().reverse();

    // Now extract the luminostiy from the array, and leave a clean list of colors
    for(var i in colorsort){
      colorsort[i] = colorsort[i].split('|')[1];
    }

    return colorsort;
  },

  // Move through all paths in a given context, pull out all jobs and begin to
  // Push them into the buffer
  autoPaint: function(context, callback) {
     // Clear all selections
    $('path.selected', context).removeClass('selected');

    // Make sure the colors are ready
    robopaint.utils.autoColor(context, false, cncserver.config.colors);

    // Holds all jobs keyed by color
    var jobs = {};
    var c = cncserver.config.colors;
    var colorMatch = robopaint.utils.closestColor;
    var convert = robopaint.utils.colorStringToArray;

    $('path', context).each(function(){
      var $p = $(this);
      var stroke = convert($p.css('stroke'));
      var fill = convert($p.css('fill'));

      // Occasionally, these come back undefined
      stroke = (stroke == null) ? false : 'color' + colorMatch(stroke, c);
      fill = (fill == null) ? false : 'color' + colorMatch(fill, c);

      // Account for fill/stroke opacity
      var op = $p.css('fill-opacity');
      if (typeof op != 'undefined') fill = (op < 0.5) ? false : fill;

      op = $p.css('stroke-opacity');
      if (typeof op != 'undefined') stroke = (op < 0.5) ? false : stroke;

      // Don't actually fill or stroke for white... (color8)
      if (fill == 'color8') fill = false;
      if (stroke == 'color8') stroke = false;

      // Add fill (and fill specific stroke) for path
      if (fill) {
        // Initialize the color job object as an array
        if (typeof jobs[fill] == 'undefined') jobs[fill] = [];

        // Give all non-stroked filled paths a stroke of the same color first
        if (!stroke) {
          jobs[fill].push({t: 'stroke', p: $p});
        }

        // Add fill job
        jobs[fill].push({t: 'fill', p: $p});
      }

      // Add stroke for path
      if (stroke) {
        // Initialize the color job object as an array
        if (typeof jobs[stroke] == 'undefined') jobs[stroke] = [];

        jobs[stroke].push({t: 'stroke', p: $p});
      }
    });

    var sortedColors = cncserver.wcb.sortedColors();

    var finalJobs = [];

    $.each(sortedColors, function(i, c){
      if (typeof jobs[c] != 'undefined'){
        var topPos = finalJobs.length;
        for(j in jobs[c]){
          var out = {
            c: c,
            t: jobs[c][j].t,
            p: jobs[c][j].p
          };

          // Place strokes ahead of fills, but retain color order
          if (out.t == 'stroke') {
            finalJobs.splice(topPos, 0, out);
          } else {
            finalJobs.push(out);
          }

        }
      }
    });

    cncserver.wcb.status('Auto Paint: ' +
      $('path', context).length + ' paths, ' +
      finalJobs.length + ' jobs');

    // Nothing manages color during automated runs, so you have to hang on to it.
    // Though we don't actually give it a default value, this ensures we get a
    // full wash before every auto-paint initialization
    var runColor;

    var jobIndex = 0;
    doNextJob();

    function doNextJob() {
      var job = finalJobs[jobIndex];
      var run = cncserver.cmd.run;

      if (job) {
        // Make sure the color matches, full wash and switch colors!
        if (runColor != job.c) {
          run(['wash', ['media', job.c]]);
          runColor = job.c;
          cncserver.cmd.sendComplete(readyStartJob);
        } else {
          readyStartJob();
        }

        function readyStartJob() {
          // Clear all selections at start
          $('path.selected', context).removeClass('selected');
          robopaint.utils.addShortcuts(job.p);

          if (job.t == 'stroke'){
            job.p.addClass('selected');
            run('status', 'Drawing path ' + job.p[0].id + ' stroke...');
            cncserver.paths.runOutline(job.p, function(){
              jobIndex++;
              job.p.removeClass('selected'); // Deselect now that we're done
              cncserver.cmd.sendComplete(doNextJob);
            })
          } else if (job.t == 'fill') {
            run('status', 'Drawing path ' + job.p[0].id + ' fill...');

            cncserver.paths.runFill(job.p, function(){
              jobIndex++;
              cncserver.cmd.sendComplete(doNextJob);
            });
          }
        }
      } else {
        run('wash');
        cncserver.cmd.sendComplete(function(){
          run([
            'park',
            ['status', 'AutoPaint Complete!'],
            ['callbackname', 'autopaintcomplete']
          ]);
        });
        if (callback) callback();
        // Done!
      }
    }
  },

  // Simulation draw of current buffer
  simulateBuffer: function() {
    var c = $('#sim')[0];
    var ctx = c.getContext("2d");
    // Clear sim canvas
    c.width = c.width;

    // Set stroke color
    ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
    ctx.lineWidth = 4;

    var doDraw = false;
    console.log('Start draw, buffer:', cncserver.state.buffer.length);

    // Move through every item in the command buffer
    for (var i in cncserver.state.buffer) {
      var next = cncserver.state.buffer[i];

      // Ensure it's an array
      if (typeof next == "string"){
        next = [next];
      }

      // What's the command?
      switch (next[0]) {
        case 'down':
          doDraw = false;
          //ctx.beginPath();
          break;
        case 'up':
          //ctx.closePath();
          doDraw = true;
          break;
        case 'move':
          // Add 48 to each side for 1/2in offset
          var x = next[1].x + 48; //(next[1].x / cncserver.canvas.width) * c.width;
          var y = next[1].y + 48; //(next[1].y / cncserver.canvas.height) * c.height;

          if (doDraw) {
            ctx.lineTo(x, y);
          } else {
            ctx.moveTo(x, y);
          }

          //ctx.lineTo(x, y);
          break;
      }
    }
    ctx.stroke();
    $('#sim').show();
    console.log('Simulation draw done!');

  },

  // Retrieve a fill path depending on config
  getFillPath: function(options){
    var ft = options.filltype;
    if (ft == 'tsp') {
      return $('#fill-spiral');
    } else {
      return $('#fill-' + ft);
    }
  }
};
}});
