/**
 * @file Holds all CNC Server command abstractions for API shortcuts. The API
 * Makes the actual commands to the server, but this manages their execution and
 * buffering to keep things executed in the correct order.
 *
 * Only applies to specific API functions that require waiting for the bot to
 * finish, handles all API callbacks internally.
 */
/* globals window, $ */

var robopaint = window.robopaint;
var _ = window._;
var cncserver = robopaint.cncserver;

// Buffer of commands to send out: This is just a localized buffer to ensure
// That commands sent very quickly get sent out in the correct order.
var sendBuffer = cncserver.sendBuffer = [];
var running = false;

// Command iterator (sends the next command to be timed/queued by CNCserver)
function sendNext() {
  if (!sendBuffer.length) {
    running = false;
    return;
  } else {
    running = true;
  }

  // Pop the next command off the array
  var cmd = sendBuffer.pop();

  // Toss out nulls, TODO: find out where these come from.
  if (cmd === null) {
    sendNext();
    return;
  }

  // Convert args to a real array
  if (_.isArguments(cmd)) {
    cmd = _.toArray(cmd);
  }

  // Force the value to be an array (if it isn't)
  if (!_.isArray(cmd)){
    cmd = [cmd];
  }


  var api = robopaint.cncserver.api;

  // TODO: any conglomerate commands that spawn other run processes and require
  // things to wait before their items are added (tool, wash) need to be done a
  // little differently to avoid out of order command errors.

  var setHeight = null; // Used on three height manuevers
  switch (cmd[0]) {
    case "move":
      var point = cncserver.utils.getPercentCoord(cmd[1]);
      point.ignoreTimeout = '1';

      // For pen only mode, bypass the data callback.
      if (parseInt(robopaint.settings.penmode) === 3) {
        point.returnData = false;
      }

      // Third argument: skipBuffer
      if (cmd[2] === true) point.skipBuffer = true;
      api.pen.move(point, moveCallback);

      function moveCallback(p) {
        // Refill paint rules!
        if (p.distanceCounter > robopaint.settings.maxpaintdistance) {
          cncserver.wcb.getMorePaint(cmd[1], sendNext);
        } else {
          // Trigger next item to get flushed out
          sendNext();
        }
      }
      break;
    case "media":
      cncserver.wcb.setMedia(cmd[1], sendNext, true);
      break;

    case "tool":
      api.tools.change(cmd[1], sendNext, {ignoreTimeout: '1'});
      break;

    case "up":
      setHeight = 0;
      /* falls through */
    case "down":
      if (setHeight === null) setHeight = 1;
      /* falls through */
    case "height":
      if (setHeight === null) setHeight = cmd[1]; // Specific height
      var options = {};

      if (!robopaint.statedata.external) {
        options = {state: setHeight, ignoreTimeout: '1'};
        if (cmd[1] === true) options.skipBuffer = true;
        robopaint.cncserver.setPen(options, sendNext);
      } else {
        options = {ignoreTimeout: '1'};
        if (cmd[1] === true) options.skipBuffer = true;
        api.pen.height(setHeight, sendNext, options);
      }
      break;

    case "power":
      var setPower = cmd[1]; // Power from 0 to 1
      if (!robopaint.statedata.external) {
        robopaint.cncserver.setPen({power: setPower}, sendNext);
      } else {
        api.pen.power(setPower, sendNext);
      }
      break;

    case "status":
      // Third argument: skipBuffer
      if (cmd[2] === true) { // Skipping buffer means just show it!
        cncserver.status(cmd[1]);
        sendNext();
      } else {
        api.buffer.message(cmd[1], sendNext);
      }
      break;

    case "progress":
      // Shortcut for streaming progress updates from modes. Use sparingly.
      var p = {val: cmd[1]};
      if (typeof cmd[2] !== 'undefined') p.max = cmd[2];
      cncserver.progress(p);
      sendNext();
      break;

    case "callbackname":
      api.buffer.callbackname(cmd[1], sendNext);
      break;

    case "pause":
      api.buffer.pause(function(){
        cncserver.pushToMode('fullyPaused');
        sendNext();
      });
      break;

    case "resume":
      api.buffer.resume(function(){
        cncserver.pushToMode('fullyResumed');
        sendNext();
      });
      break;

    case "clear":
      api.buffer.clear(sendNext);
      break;

    case "localclear":
      sendBuffer = cncserver.sendBuffer = [];

      // If we're starting to pause till empty when this is called...
      if (cncserver.state.pausingTillEmpty) {
        // Clear the flag status, it should shut down on its own.
        cncserver.state.pausingTillEmpty = false;
      }
      sendNext();
      break;

    case "resetdistance":
      api.pen.resetCounter(sendNext);
      break;

    case "zero":
      api.pen.zero(sendNext);
      break;

    case "unlock":
      api.motors.unlock(sendNext);
      break;

    case "wash":
      cncserver.wcb.fullWash(sendNext, cmd[1], true);
      break;

    case "park":
      options = {ignoreTimeout: '1'};

      // Second argument: skipBuffer
      if (cmd[1] === true) options.skipBuffer = true;

      api.pen.park(sendNext, options);
      break;

    default:
      console.debug('Queue shortcut not found:' + cmd);
      sendNext();
  }
}

cncserver.cmd = {
  // Add a command to the queue! format is cmd short name, arguments, or
  // An array based multiple set. Pass "true" as second arg for adding to start
  // of the queue.
  run: function() {
    if (typeof arguments[0] === "object") {
      var reverse = (arguments[1] === true);

      // Reverse the order of items added to the wrong end of the buffer
      if (reverse) arguments[0].reverse();
      $.each(arguments[0], function(i, args) {
        if (!reverse) {
          sendBuffer.unshift(args);
        } else {
          sendBuffer.push(args);
        }
        if (cncserver.state.isRecording) cncserver.state.recordBuffer.unshift(args);
      });
    } else {
      // No reverse buffer add support for native argument runs
      sendBuffer.unshift(arguments);
      if (cncserver.state.isRecording) cncserver.state.recordBuffer.unshift(arguments);
    }
  }
};

// Wait around for the buffer to contain elements, and for us to not be
// currently processing the buffer queue
setInterval(function(){
  if (sendBuffer.length && !running ) {
    sendNext();
  }
}, 10);
