/**
 * @file Holds all CNC Server command abstractions for API shortcuts. The API
 * Makes the actual commands to the server, but this manages their execution and
 * buffering to keep things executed in the correct order.
 *
 * Only applies to specific API functions that require waiting for the bot to
 * finish, handles all API callbacks internally.
 */


define(function(){return function($, robopaint, cncserver){

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
      var point = cncserver.wcb.getPercentCoord(cmd[1]);
      point.ignoreTimeout = '1';
      api.pen.move(point, function(p) {
        // Refill paint rules!
        if (p.distanceCounter > robopaint.settings.maxpaintdistance) {
          cncserver.wcb.getMorePaint(cmd[1], sendNext);
        } else {
          // Trigger next item to get flushed out
          sendNext();
        }
      });

      lastPoint = cncserver.wcb.getPercentCoord(cmd[1]);
      break;
    case "tool": // TODO: Change this to media elsehwere it's used
      cncserver.wcb.setMedia(cmd[1], sendNext, cmd[2]);
      break;
    case "actualtool":
      api.tools.change(cmd[1], sendNext, {ignoreTimeout: '1'});
      break;
    case "up":
      api.pen.up(sendNext, {ignoreTimeout: '1'});
      break;
    case "down":
      api.pen.down(sendNext, {ignoreTimeout: '1'});
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
      cncserver.wcb.fullWash(sendNext, cmd[1]);
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
  // Easy set for progress!
  progress: function(options){
    if (typeof options.val !== "undefined") {
      $('progress').attr('value', options.val);
    }

    if (typeof options.max !== "undefined") {
      $('progress').attr('max', options.max);
    }
  },

  // Add a command to the queue! format is cmd short name, arguments, or
  // An array based multiple set. Pass "true" as second arg for adding to start
  // of the queue.
  run: function() {
    if (typeof arguments[0] == "object") {
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

}});
