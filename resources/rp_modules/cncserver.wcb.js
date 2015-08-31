/**
 * @file Holds all Robopaint watercolorbot specific configuration and utility
 * functions.
 */
 var robopaint = window.robopaint;
 var cncserver = robopaint.cncserver;

cncserver.wcb = {
  // Grouping function to do a full wash of the brush
  fullWash: function(callback, useDip, fromSendBuffer) {
    var toolExt = useDip ? 'dip' : '';

    switch(parseInt(robopaint.settings.penmode)) {
      case 3:
      case 2: // Dissallow water
        cncserver.status(
          robopaint.t('libs.ignorewash', {mode:
            robopaint.t('settings.output.penmode.opt' + robopaint.settings.penmode)
          })
        );
        if (callback) callback(true);
        break;
      default:
        cncserver.cmd.run([
          ['status', robopaint.t('libs.washing')],
          'resetdistance',
          ['tool', 'water0' + toolExt],
          ['tool', 'water1' + toolExt],
          ['tool', 'water2' + toolExt],
          ['status', robopaint.t('libs.washed')],
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
    var colors = robopaint.statedata.colorsets[robopaint.settings.colorset].colors;

    if (toolName.indexOf('water') !== -1) {
      return robopaint.t('common.water');
    } else {
      return colors[toolName.substr(5, 1)].name;
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
          cncserver.status(
            robopaint.t('libs.ignorewater', {mode:
              robopaint.t('settings.output.penmode.opt' + mode)
            })
          );
          if (callback) callback(true);
          return;
      }
    } else { // Color Change
      switch(mode) {
        case 3: // Dissallow all
        case 1: // Dissallow paint
          cncserver.status(
            robopaint.t('libs.ignorepaint', {mode:
              robopaint.t('settings.output.penmode.opt' + mode)
            })
          );
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
      ['status', robopaint.t('libs.inking', {media: name})],
      'resetdistance',
      ['tool', toolName],
      ['status', robopaint.t('libs.inked', {media: name})]
    ], fromSendBuffer);

    if (callback) callback();
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
        // TODO: Does this output the wrong target name if disallowed?
        cncserver.cmd.run([
          ['status', robopaint.t('libs.reinking', {media: name})],
          'resetdistance',
          ['media', 'water0'],
          'up',
          ['move', point],
          ['status', robopaint.t('libs.reinked', {media: name})],
          'down'
        ], true); // Add to the start (not the end) of the local buffer
        if (callback) callback();

        break;
      case 2: // Dissallow water
        cncserver.cmd.run([
          ['status', robopaint.t('libs.reinkingdry', {media: name})],
          'resetdistance',
          ['media', cncserver.state.mediaTarget],
          'up',
          ['move', point],
          ['status', robopaint.t('libs.reinked', {media: name})],
          'down'
        ], true); // Add to the start (not the end) of the local buffer

        if (callback) callback();

        break;
      case 3: // Dissallow All
        // Get paint ignored for draw mode 3
        if (callback) callback(true);
        break;
      default:
        if (parseInt(robopaint.settings.refillaction) == 0) {
          cncserver.cmd.run([
            ['status', robopaint.t('libs.reinking', {media: name})],
            'resetdistance',
            ['media', 'water0dip'],
            ['media', cncserver.state.mediaTarget],
            'up',
            ['move', point],
            ['status', robopaint.t('libs.reinked', {media: name})],
            'down'
          ], true); // Add to the start (not the end) of the local buffer
        } else if (parseInt(robopaint.settings.refillaction) == 1) {
          cncserver.cmd.run([
            ['status', robopaint.t('libs.reinking', {media: name})],
            'resetdistance',
            ['media', 'water0dip'],
            ['media', cncserver.state.mediaTarget + "dip"],
            'up',
            ['move', point],
            ['status', robopaint.t('libs.reinked', {media: name})],
            'down'
          ], true); // Add to the start (not the end) of the local buffer
        } else if (parseInt(robopaint.settings.refillaction) == 2) {
          cncserver.cmd.run([
            ['status', robopaint.t('libs.reinking', {media: name})],
            'resetdistance',
            ['media', 'water0dip'],
            ['media', cncserver.state.mediaTarget + "dip"],
            ['media', 'water0dip'],
            ['media', cncserver.state.mediaTarget + "dip"],
            'up',
            ['move', point],
            ['status', robopaint.t('libs.reinked', {media: name})],
            'down'
          ], true); // Add to the start (not the end) of the local buffer
        }
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

    // Add "water2" tool last (if available)
    if (typeof robopaint.currentBot.data.tools.water2 !== 'undefined') {
      colorsort.push('water2');
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

      // Account for fill/stroke opacity (paint with clean water2!)
      // TODO: What do we do here for the EggBot? Likely skip, or ignore....
      var op = Math.min($p.css('fill-opacity'), $p.css('opacity'));
      if (typeof op != 'undefined') fill = (op < 1) ? 'water2' : fill;

      op = Math.min($p.css('stroke-opacity'), $p.css('opacity'));
      if (typeof op != 'undefined') stroke = (op < 1) ? 'water2' : stroke;

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

    // Send out the initialization status message.
    cncserver.status(robopaint.t('libs.autoinit', {
      pathNum: $('path', context).length,
      jobsNum: finalJobs.length
    }));

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
            run('status', robopaint.t('libs.autostroke', {id: job.p[0].id}));
            cncserver.paths.runOutline(job.p, function(){
              jobIndex++;
              job.p.removeClass('selected'); // Deselect now that we're done
              cncserver.cmd.sendComplete(doNextJob);
            })
          } else if (job.t == 'fill') {
            run('status', robopaint.t('libs.autofill', {id: job.p[0].id}));

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
            ['status', robopaint.t('libs.autocomplete')],
            ['callbackname', 'autopaintcomplete']
          ]);
        });
        if (callback) callback();
        // Done!
      }
    }
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
