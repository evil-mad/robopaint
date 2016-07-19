/**
 * @file Holds all Robopaint watercolorbot specific configuration and utility
 * functions.
 */
/* globals window, mainWindow */
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
            robopaint.t(
              'settings.output.penmode.opt' + robopaint.settings.penmode
            )
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
    if (typeof toolName !== 'string') toolName = cncserver.state.media;
    if (toolName === "") return '';

    // TODO: There probably has to be a better way to do this.
    toolName = toolName.replace('dip', ''); // Conversion for dip tools

    if (toolName.indexOf('water') !== -1) {
      return robopaint.t('common.water');
    } else {
      return robopaint.media.currentSet.colors[toolName.substr(-1)].name;
    }
  },

  // Wrapper for toolchange to manage pen mode logic
  setMedia: function(toolName, callback, fromSendBuffer){
    var name = cncserver.wcb.getMediaName(toolName).toLowerCase();
    var mode = parseInt(robopaint.settings.penmode, 10);

    // Water change
    if (name === "water") {
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
    } else if (toolName.indexOf('color') !== -1) { // Color Change
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

    if (toolName.indexOf('manualswap') !== -1) { // Manual Change
      var swap = toolName.split('|');
      // Spool into the buffer pen specific statuses and manualswap start.
      cncserver.cmd.run([
        ['status', robopaint.t('libs.manual.status', {color: name})],
        'resetdistance',
        ['tool', 'manualswap'], // Buffer will pause on this, till resume.
        ['status', robopaint.t('libs.manual.resume', {color: name})]
      ], fromSendBuffer);
    } else {
      // Spool into the buffer brush specific statuses and tool change.
      cncserver.cmd.run([
        ['status', robopaint.t('libs.inking', {media: name})],
        'resetdistance',
        ['tool', toolName],
        ['status', robopaint.t('libs.inked', {media: name})]
      ], fromSendBuffer);
    }


    if (callback) callback();
  },

  // Wet the brush and get more of targeted media, then return to
  // point given and trigger callback
  getMorePaint: function(point, callback) {
    var name = cncserver.wcb.getMediaName(cncserver.state.mediaTarget).toLowerCase();

    // Reset the counter for every mode on getMorePaint
    robopaint.cncserver.api.pen.resetCounter();
    var penmode = parseInt(robopaint.settings.penmode, 10);
    var refillaction = parseInt(robopaint.settings.refillaction, 10);

    // Change what happens here depending on penmode
    switch(penmode) {
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
        if (refillaction === 0) {
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
        } else if (parseInt(robopaint.settings.refillaction, 10) === 1) {
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
        } else if (refillaction === 2) {
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
};
