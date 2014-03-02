/*
 * @file Holds all RoboPaint CNC Server API extensions and related functions.
 *  For right now, this is just the high level API autopaint functionality.
 */

robopaint.api = {}; // All RoboPaint API state vars should be stored here

// Global remote print state and storage variables
robopaint.api.print = {
  enabled: false,
  queue: [], // Array of Objects for actual queue
  requestOptions: {}, // Requested print settings for a new print queue item
  settingsOverrideWhitelist: [
    'latencyoffset',
    'movespeed',
    'paintspeed',
    'filltype',
    'fillangle',
    'fillspacing',
    'maxpaintdistance',
    'fillprecision',
    'strokeprecision',
    'strokeovershoot',
    'gapconnect'
  ]
}

// Establish high-level print endpoint ========================================

var printDisabledMessage = 'The SVG import API is currently disabled. Enable it in settings and then click the button in the RoboPaint GUI.';

/**
 * `robopaint/v1/print` endpoint
 * GET - List print queue and current status
 * POST - Create new queue items to print
 */
cncserver.createServerEndpoint('/robopaint/v1/print', function(req, res) {
  var queue = robopaint.api.print.queue;

  // Forbid change commands until printMode is enabled
  if (!robopaint.api.print.enabled && req.route.method != 'get') {
    return [403, printDisabledMessage];
  }

  // Are we busy? Fill a quick var for reuse...
  var busy = false;
  if (queue.length) {
    busy = queue[queue.length-1].status == 'printing';
  }

  if (req.route.method == 'get') { // GET list of print queue items and status
    return {code: 200, body: {
      status: (function(){
        if (robopaint.api.print.enabled) {
          return busy ? 'busy' : 'ready';
        } else {
          return 'disabled';
        }
      })(),
      items: robopaint.api.print.queue.length,
      queue: (function(){
        var items = [];
        $.each(robopaint.api.print.queue, function(id, item){
          items.push({
            uri: '/robopaint/v1/print/' + id,
            name: item.options.name,
            status: item.status
          });
        });
        return items;
      })()
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

    // Can't add queue items while one is printing! A "temporary" restriction
    // till I get SVG verification packaged up and separated from method-draw
    if (busy) {
      return [503, 'Cannot add to queue during ongoing print job.'];
    }

    // Setup the load Callback that will be checked for on the subWindow pages
    // in edit and print modes to verify and trigger actions. Only those pages
    // decide the fate of this request.
    robopaint.api.print.requestOptions = options;
    robopaint.api.print.loadCallback = function(e) {
      if (e.status == 'success') { // Image loaded and everything is great!

        // Actually add item to queue
        var d = new Date();
        queue.push({
          status: 'waiting',
          options: options,
          pathCount: e.pathCount,
          percentComplete: 0,
          startTime: d.toISOString(),
          endTime: null,
          secondsTaken: null,
          svg: localStorage['svgedit-default'],
          printingStatus: "Queued for printing..."
        });

        // Return response to client application finally
        res.status(201).send(JSON.stringify({
          status: 'verified and added to queue',
          uri: '/robopaint/v1/print/' + (queue.length - 1),
          item: queue[queue.length - 1]
        }));

        // Trigger printing/function management
        startPrintQueue(queue.length-1, e.context);
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
      if (robopaint.api.print.queueItemComplete) {
        robopaint.api.print.queueItemComplete(true);
      } else {
        item.status = 'cancelled';
        setRemotePrintWindow(false, true);
        // Clear close and park
        $subwindow[0].contentWindow.unBindEvents(function(){
          robopaint.switchMode('home');
        });
      }
      return {code: 200, body: robopaint.api.print.queue[qid]};
    } else {
      return [406, "Queue item in state '" + item.status + "' cannot be cancelled"];
    }
  } else {
    return false; // 405 - Method Not Supported
  }

});


/**
 * `robopaint/remote`
 * Example HTML returning endpoint for resources/api/example.remotepaint.html
 */
cncserver.createServerEndpoint('/robopaint/remote', function(req, res) {
  res.sendfile('resources/api/example.remotepaint.html')
  return true;
});

/**
 * Bind buttons specific for remote print
 */
function bindRemoteControls() {
  $('#remoteprint-window button').click(function(e) {
    if ($(this).is('.cancel')) {
      if (setRemotePrintWindow(false)) {
        if (robopaint.api.print.queueItemComplete) {
          robopaint.api.print.queueItemComplete(true);
        } else {
          robopaint.switchMode('home');
        }
      }
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
  var $pause = $('#remoteprint-window #pause');
  var $status = $('#remoteprint-window #statusmessage');
  var $progress = $('#remoteprint-window progress');

  var $printPause = $('#pause', context);
  var $printStatus = $('#statusmessage', context);
  var $printProgress = $('progress', context);

  var oldSettings = getSettings();

  // Parse and inject settingsOverides
  if (item.options.settingsOverrides) {
    var overrides = item.options.settingsOverrides;
    var whitelist = robopaint.api.print.settingsOverrideWhitelist;
    for (var key in overrides) {
      if (whitelist.indexOf(key)) {
        robopaint.settings[key] = overrides[key];
      }
    }

    // Send and verify settings
    saveSettings();
    loadSettings();
  }

  // Throw the image into the preview area
  $('svg#preview g#cncserversvg').append(localStorage["svgedit-default"]);

  // Start printing
  item.status = 'printing';
  $printPause.click();
  $pause.prop('disabled', false); // Enable Pause button

  // Bind controls
  $pause.click(function(e){
    $printPause.click();
  });

  // Propagate text changes from button and message
  $printPause.add($printStatus).bind('DOMSubtreeModified', function(e){
    switch (e.currentTarget) {
      case $printPause[0]:
        $pause.text($printPause.text());
        $pause.attr('class', $printPause.attr('class'));
        $pause.attr('title', $printPause.attr('title'));
        $pause.prop('disabled', $printPause.prop('disabled'));
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
  robopaint.api.print.queueItemComplete = queueItemComplete;
  function queueItemComplete(cancelled) {
    // Unbind elements and clear interval
    $printPause.add($printStatus).unbind('DOMSubtreeModified');
    clearInterval(checkProgress);

    if (!cancelled) {
      // Final item statuses
      item.status = "complete";
      item.percentComplete = 100;
    } else {
      item.status = 'cancelled';
      // Clear close and park
      $subwindow[0].contentWindow.unBindEvents(function(){
        robopaint.switchMode('home');
      });
    }

    // Set endTime and elapsed with cancel OR completion.
    var d = new Date();
    item.endTime = d.toISOString();
    item.secondsTaken = (new Date(item.endTime) - new Date(item.startTime)) / 1e3;

    // Reset settings to previous values
    robopaint.settings = oldSettings;
    saveSettings();
    loadSettings();

    // Empty the preview window
    $('svg#preview g#cncserversvg').empty();

    // Close the window
    setRemotePrintWindow(false, true);

    // Remove the globalized function
    delete robopaint.api.print.queueItemComplete;
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
    $('#remoteprint-window button#pause').prop('disabled', true).text('Pause');
    $('#remoteprint-window #statusmessage').text('Waiting for drawing from client...');

    $('#remoteprint-window').fadeIn('slow');
  } else {
    $('#remoteprint-window').fadeOut('slow');
  }
  setModal(toggle);
  robopaint.api.print.enabled = !!toggle; // Set printmode to exact boolean of toggle
  responsiveResize(); // Ensure the layout is updated now that it's enabled
  return true
}
