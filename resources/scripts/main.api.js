/*
 * @file Holds all RoboPaint CNC Server API extensions and related functions.
 *  For right now, this is just the high level API autopaint functionality.
 */

robopaint.api = {}; // All RoboPaint API state vars should be stored here

// Global remote print state and storage variables
robopaint.api.print = {
  enabled: false,
  queue: [], // Array of Objects for actual queue
  requestOptions: {} // Requested print settings for a new print queue item
}

// Establish high-level print endpoint ========================================

var printDisabledMessage = 'The SVG import API is currently disabled. Enable it in settings and then click the button in the RoboPaint GUI.';

/**
 * `robopaint/v1/print` endpoint
 * GET - List print queue and current status
 * POST - Create new queue items to print
 */
cncserver.createServerEndpoint('/robopaint/v1/print', function(req, res) {

  // Forbid change commands until printMode is enabled
  if (!robopaint.api.print.enabled && req.route.method != 'get') {
    return [403, printDisabledMessage];
  }

  if (req.route.method == 'get') { // GET list of print queue items and status
    return {code: 200, body: {
      status: 'ready',
      items: robopaint.api.print.queue.length,
      queue: robopaint.api.print.queue
    }};
  } else if (req.route.method == 'post') { // POST new print item
    var options = req.body.options;
    var msg = '';

    // Basic sanity check incoming content
    if (!req.body.svg) msg = "body content node required: svg";
    if (!req.body.options) {
      msg = 'body content node required: options';
    } else {
      if (!req.body.options.name) msg = 'name option required: options.name';
    }

    if (msg) return [406, msg];

    // Setup the load Callback that will be checked for on the subWindow pages
    // in edit and print modes to verify and trigger actions. Only those pages
    // decide the fate of this request.
    robopaint.api.print.requestOptions = options;
    robopaint.api.print.loadCallback = function(e) {
      if (e.status == 'success') { // Image loaded and everything is great!

        // Actually add item to queue
        var d = new Date();
        robopaint.api.print.queue.push({
          status: 'waiting',
          options: options,
          pathCount: e.pathCount,
          percentComplete: 0,
          startTime: d.toISOString(),
          svg: localStorage['svgedit-default'],
        });

        // Return response to client application finally
        res.status(201).send(JSON.stringify({
          status: 'verified and added to queue',
          uri: '/robopaint/v1/print/' + (robopaint.api.print.queue.length - 1),
          item: robopaint.api.print.queue[robopaint.api.print.queue.length - 1]
        }));

        // Trigger printing/function management
        startPrintQueue(robopaint.api.print.queue.length-1, e.context);
      } else { // Image failed to load, return error
        res.status(406).send(JSON.stringify({
          status: 'content verification failed',
          reason: e.error
        }));
        // Return to home mode after error
        robopaint.switchMode('home');
      }

      // Now that we're done, destroy the callback...
      delete robopaint.api.print.loadCallback;
    }

    // Store the SVG content
    window.localStorage.setItem('svgedit-default', req.body.svg);
    // Switch modes (this eventually triggers the above callback)
    robopaint.switchMode('edit');

    // TODO: Manage queue, send to print page with options

    return true; // Tell the server endpoint we'll handle the response from here...

  } else {
    return false; // 405 - Method Not Supported
  }

});

/**
 * `robopaint/v1/print/[QID]` endpoint
 * GET - Return print queue item
 * DELETE - Cancel print queue item
 */
cncserver.createServerEndpoint('/robopaint/v1/print/:qid', function(req, res) {
  var qid = req.params.qid;
  var item = robopaint.api.print.queue[qid];

  // Forbid change commands until printMode is enabled
  if (!robopaint.api.print.enabled && req.route.method != 'get') {
    return [403, printDisabledMessage];
  }

  if (!item){
    return [404, 'Queue ID ' + qid + ' not found'];
  }

  if (req.route.method == 'get') { // Is this a GET request?
    return {code: 200, body: item};
  } else if (req.route.method == 'delete'){
    if (item.status == "waiting" || item.status == "printing") {
      item.status = 'cancelled';
      setRemotePrintWindow(false, true);
      robopaint.switchMode('home');
      return {code: 200, body: robopaint.api.print.queue[qid]};
    } else {
      return [406, "Queue item in state '" + item.status + "' cannot be cancelled"];
    }
  } else {
    return false; // 405 - Method Not Supported
  }

});

/**
 * Bind buttons specific for remote print
 */
function bindRemoteControls() {
  $('#remoteprint-window button').click(function(e) {
    if ($(this).is('.cancel')) {
      setRemotePrintWindow(false);
      robopaint.switchMode('home');
    }
  });
}


/**
 * Attempt/Intend to open or close print window
 *
 * @param {Number} index
 *   Queue index item to reference
 * @param {Object} context
 *   Context source for jQuery to use
 */
function startPrintQueue(index, context) {
  var item = robopaint.api.print.queue[index];
  var $pause = $('#remoteprint-window button.pause');
  var $status = $('#remoteprint-window #statusmessage');
  var $progress = $('#remoteprint-window progress');

  var $printPause = $('#pause', context);
  var $printStatus = $('#statusmessage', context);
  var $printProgress = $('progress', context);

  // Start printing
  item.status = 'printing';
  $printPause.click();

  // Bind controls
  $pause.click(function(e){
    $printPause.click();
  });

  // Propagate text changes from button and message
  $printPause.add($printStatus).bind('DOMSubtreeModified', function(e){
    switch (e.currentTarget) {
      case $printPause[0]:
        $pause.text($printPause.text());
        if ($printPause.is('.ready')) {
          queueItemComplete();
        }
        break;
      case $printStatus[0]:
        item.printingStatus = $printStatus.text();
        $status.text(item.printingStatus);
        break;
    }
  });

  // Propagate progress bar changes
  var checkProgress = setInterval(function(){
    item.percentComplete = Math.round(($printProgress.val() / $printProgress.attr('max')) * 100);
    $progress.val(item.percentComplete);
  }, 1000);

  // Callback triggered when printing is complete
  function queueItemComplete() {
    // Unbind elements and clear interval
    $printPause.add($printStatus).unbind('DOMSubtreeModified');
    clearInterval(checkProgress);

    // Final item statuses
    item.status = "complete";
    item.percentComplete = 100;

    // Close the window
    setRemotePrintWindow(false, true);
  }
}


/**
 * Attempt/Intend to open or close print window
 *
 * @param {Boolean} toggle
 *   True to show window, false to hide.
 * @returns {Boolean}
 *   True if the operation was confirmed, false if it was cancelled.
 */
function setRemotePrintWindow(tryOpen, force) {
  // Sanity check: Do nothing if we're already open (or closed)
  if (robopaint.api.print.enabled == tryOpen) {
    return false;
  }

  var toggle = false;
  var msg = "Hey there, welcome to Remote Paint mode! This mode will turn RoboPaint into a graphics 'print server', ready to take an image from another application and print it immediately!";
  msg+= "\n\n* Images sent will only be received while this mode is on";
  msg+= "\n\n* Once an image is finished, this mode will exit";
  msg+= "\n\n* Before clicking OK, make sure your bot is completely setup and ready to go!";
  msg+= "\n\n* Click cancel if you're not quite ready to go. You can also exit anytime while in Remote Paint mode";

  if (!tryOpen) {
    if (!force) {
      msg = "Are you sure you want to leave Remote Paint mode?";
      msg+= "\n\n Any print processes and client applications will be cancelled/disconnected.";
      toggle = !confirm(msg);
    }
  } else {
    toggle = confirm(msg);
  }

  // Sanity check now that we have confirmation
  if (robopaint.api.print.enabled == toggle) {
    return false;
  }

  if (toggle) {
    // Reset inputs
    $('#remoteprint-window progress').val(0);
    $('#remoteprint-window button.pause').text('Pause');
    $('#remoteprint-window #statusmessage').text('Waiting for drawing from client...');

    $('#remoteprint-window').fadeIn('slow');
  } else {
    $('#remoteprint-window').fadeOut('slow');
  }
  setModal(toggle);
  robopaint.api.print.enabled = !!toggle; // Set printmode to exact boolean of toggle
  return true
}
