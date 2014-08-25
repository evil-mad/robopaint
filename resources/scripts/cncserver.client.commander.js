/**
 * @file Holds all CNC Server command abstractions for API shortcuts. The API
 * Makes the actual commands to the server, but this manages their execution and
 * buffering to avoid collisions.
 *
 * Only applies to specific API functions that require waiting for the bot to
 * finish, handles all API callbacks internally.
 */

// TODO: DO this better!
// Because these are outside of any function they're polluting the global scope,
// and that's just bad pudding. Not to mention, if you think you have to use
// globals for something, then you're probbaly doing it wrong. These are likely
// one of the last vestiges of the far simpler code. Just need to root out where
// they're used and possibly attach them directly to the cncserver.cmd object,
// or refactor them out completely.
var returnPoints = [];
var lastPoint = {};

define(function(){return function($, robopaint, cncserver){
cncserver.cmd = {
  // Easy set for progress!
  progress: function(options){
    if (typeof options.val !== "undefined") {
      $('progress').attr('value', options.val);
    }

    if (typeof options.max !== "undefined") {
      $('progress').attr('max', options.max);
    }
  },

  // CMD specific callback handler
  cb: function(d) {
    // TODO: Check for errors in callback return values
    // This is nitpicky at best, as the only errors to be returned on any
    // API callback don't really have a clear path of action, other than perhaps
    // stopping and alerting the user. This should probably wait until we have
    // a proper non-blocking alert/message system before attempting to fix.

    if (!cncserver.state.buffer.length) {
      cncserver.state.process.busy = false;
      cncserver.state.process.max = 0;
      cncserver.cmd.progress({val: 0, max: 0});
    } else {
      // Update the progress bar
      cncserver.cmd.progress({
        val: cncserver.state.process.max - cncserver.state.buffer.length,
        max: cncserver.state.process.max
      });

      // Check for paint refill
      if (!cncserver.state.process.paused) {
        if (cncserver.state.pen.distanceCounter > robopaint.settings.maxpaintdistance && cncserver.state.buffer.length) {
          var returnPoint = returnPoints[returnPoints.length-1] ? returnPoints[returnPoints.length-1] : lastPoint;
          cncserver.wcb.getMorePaint(returnPoint, cncserver.cmd.executeNext);
        } else {
          // Execute next command
          cncserver.cmd.executeNext();
        }
      } else {
        cncserver.state.process.pauseCallback();
      }
    }
  },

  executeNext: function(executeCallback) {
    // Because we're interacting with an object in the parent scope, this file
    // stays loaded even after its parent window instance dies. An easy way
    // to see if it's dead, is if console is null (evaluates false)
    if (!console) {
      // At this point the parent window is gone and we don't need to do anything
      // but a bit of cleanup
      delete cncserver.wcb;
      delete cncserver.config;
      delete cncserver.paths;
      delete cncserver.state;
      return;
    }

    if (!cncserver.state.buffer.length) {
      cncserver.cmd.cb();
      return;
    } else {
      cncserver.state.process.busy = true;
    };

    var next = cncserver.state.buffer.pop();

    if (typeof next == "string"){
      next = [next];
    }

    switch (next[0]) {
      case "move":
        returnPoints.unshift(next[1]);
        if (returnPoints.length > 4) {
          returnPoints.pop();
        }
        lastPoint = next[1];
        robopaint.cncserver.api.pen.move(cncserver.wcb.getPercentCoord(next[1]), cncserver.cmd.cb);
        break;
      case "tool":
        cncserver.wcb.setMedia(next[1], cncserver.cmd.cb);
        break;
      case "up":
        returnPoints = [];
        robopaint.cncserver.api.pen.up(cncserver.cmd.cb);
        break;
      case "down":
        robopaint.cncserver.api.pen.down(cncserver.cmd.cb);
        break;
      case "status":
        cncserver.wcb.status(next[1], next[2]);
        cncserver.cmd.cb(true);
        break;
      case "wash":
        cncserver.wcb.fullWash(cncserver.cmd.cb, next[1]);
        break;
      case "park":
        robopaint.cncserver.api.pen.park(cncserver.cmd.cb);
        break;
      case "custom":
        cncserver.cmd.cb();
        if (next[1]) next[1](); // Run custom passed callback
        break;
      default:
        console.debug('Queue shortcut not found:' + next[0]);
    }
    if (typeof executeCallback == "function") executeCallback();
  },

  // Add a command to the queue! format is cmd short name, arguments
  run: function(){
    if (typeof arguments[0] == "object") {
      cncserver.state.process.max+= arguments.length;
      $.each(arguments[0], function(i, args){
        cncserver.state.buffer.unshift(args);
        if (cncserver.state.isRecording) cncserver.state.recordBuffer.unshift(args);
      });
    } else {
      cncserver.state.process.max++;
      cncserver.state.buffer.unshift(arguments);
      if (cncserver.state.isRecording) cncserver.state.recordBuffer.unshift(arguments);
    }

  }
};

// Wait around for the buffer to contain elements, and for us to not be
// currently processing the buffer queue
setInterval(function(){
  if (!cncserver.state.process.busy && cncserver.state.buffer.length && !cncserver.state.process.paused) {
    cncserver.cmd.executeNext();
  }
}, 10);
}});
