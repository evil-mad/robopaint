/*
 * @file Holds all RoboPaint CNC Server API extensions and related functions.
 *  For right now, this is just the high level API autopaint functionality.
 */

robopaint.api = {}; // All RoboPaint API state vars should be stored here

// Global print vars
robopaint.api.printMode = false;
robopaint.api.printQueue = [];

// Establish high-level print endpoint ========================================

var printDisabledMessage = 'Remote print is currently disabled. Enable it in settings and then click the button in the RoboPaint GUI.';

/**
 * `robopaint/v1/print` endpoint
 * GET - List print queue and current status
 * POST - Create new queue items to print
 */
cncserver.createServerEndpoint('/robopaint/v1/print', function(req, res) {

  // Forbid any commands until printMode is enabled
  if (!robopaint.api.printMode) {
    return [403, printDisabledMessage];
  }

  if (req.route.method == 'get') { // GET list of print queue items and status
    return {code: 200, body: {
      status: 'ready',
      items: robopaint.api.printQueue.length,
      queue: robopaint.api.printQueue
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

    // TODO: What happens with user interaction at this point?
    //   Should a user be kicked off or warned?

    // Setup the load Callback that will be checked for on the subWindow pages
    // in edit and print modes to verify and trigger actions. Only those pages
    // decide the fate of this request.
    $subwindow.externalLoadCallbackOptions = options;
    $subwindow.externalLoadCallback = function(e) {
      if (e.status == 'success') {
        var d = new Date();
        robopaint.api.printQueue.push({
          status: 'waiting',
          options: options,
          pathCount: e.pathCount,
          startTime: d.toISOString(),
          svg: localStorage['svgedit-default'],
        });

        res.status(201).send(JSON.stringify({
          status: 'verified and added to queue',
          uri: '/robopaint/v1/print/' + (robopaint.api.printQueue.length - 1),
          item: robopaint.api.printQueue[robopaint.api.printQueue.length - 1]
        }));
      } else {
        res.status(406).send(JSON.stringify({
          status: 'content verification failed',
          reason: e.error
        }));
      }

      // Now that we're done, destroy the callback...
      $subwindow.externalLoadCallback = null;
    }

    // Store the SVG content
    window.localStorage.setItem('svgedit-default', req.body.svg);
    // Switch modes (this eventually triggers the above callback)
    $('#bar-edit').click();

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

  // Forbid any commands until printMode is enabled
  if (!robopaint.api.printMode) {
    return [403, printDisabledMessage];
  }

  if (!robopaint.printQueue[qid]){
    return [404, 'Queue ID ' + qid + ' not found'];
  }

  if (req.route.method == 'get') { // Is this a GET request?
    return {code: 200, body: robopaint.printQueue[qid]};
  } else if (req.route.method == 'delete'){
    // TODO: Actually stop printing if it was?
    robopaint.printQueue[qid].status = cancelled;
    return {code: 200, body: robopaint.printQueue[qid]};
  } else {
    return false; // 405 - Method Not Supported
  }

});
