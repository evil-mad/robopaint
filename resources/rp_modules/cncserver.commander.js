/**
 * @file Holds all CNC Server command abstractions for API shortcuts. The API
 * Makes the actual commands to the server, but this manages their execution and
 * buffering to keep things executed in the correct order.
 *
 * Only applies to specific API functions that require waiting for the bot to
 * finish, handles all API callbacks internally.
 */

var robopaint = window.robopaint;
var cncserver = robopaint.cncserver;

// Buffer of commands to send out: This is just a localized buffer to ensure
// That commands sent very quickly get sent out in the correct order.
var sendBuffer = [];
var running = false;
var lastPoint = {};


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
  if (typeof cmd == "string"){
    cmd = [cmd];
  }

  var api = robopaint.cncserver.api;

  // TODO: any conglomerate commands that spawn other run processes and require
  // things to wait before their items are added (tool, wash) need to be done a
  // little differently to avoid out of order command errors.

  switch (cmd[0]) {
    case "move":
      var point = cncserver.utils.getPercentCoord(cmd[1]);
      point.ignoreTimeout = '1';

      // Short-circuit API call for a direct localized NODE API call
      if (robopaint.cncserver.api.server.domain == "localhost") {
        robopaint.cncserver.setPen(point, moveCallback);
      } else {
        api.pen.move(point, moveCallback);
      }

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
    case "down":
      var h = (cmd[0] === 'down') ? 1 : 0;

      if (robopaint.cncserver.api.server.domain == "localhost") {
        robopaint.cncserver.setPen({state: h}, sendNext);
      } else {
        api.pen.height(h, sendNext, {ignoreTimeout: '1'});
      }
      break;
    case "status":
      api.buffer.message(cmd[1], sendNext);
      break;
    case "callbackname":
      api.buffer.callbackname(cmd[1], sendNext);
      break;
    case "pause":
      api.buffer.pause(sendNext);
      break;
    case "resume":
      api.buffer.resume(sendNext);
      break;
    case "clear":
      api.buffer.clear(sendNext);
      break;
    case "localclear":
      sendBuffer = [];
      break;
    case "resetdistance":
      api.pen.resetCounter(sendNext);
      break;
    case "wash":
      cncserver.wcb.fullWash(sendNext, cmd[1], true);
      break;
    case "park":
      api.pen.park(sendNext, {ignoreTimeout: '1'});
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
      $.each(arguments[0], function(i, args){
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
  },

  // Run callback once the sendBuffer is empty
  sendComplete: function(callback) {
    var timer = setInterval(function(){
      if (sendBuffer.length === 0) {
        callback();
        clearInterval(timer);
      }
    }, 20);
  }
};

// Wait around for the buffer to contain elements, and for us to not be
// currently processing the buffer queue
setInterval(function(){
  if (sendBuffer.length && !running ) {
    sendNext();
  }
}, 10);
