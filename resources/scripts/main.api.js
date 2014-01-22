/*
 * @file Holds all RoboPaint CNC Server API extensions and related functions.
 *  For right now, this is just the high level API autopaint functionality.
 */


// Establish high-level print endpoint ========================================
robopaint.printQueue = [];
cncserver.createServerEndpoint('/robopaint/v1/print', function(req, res) {
  if (req.route.method == 'get') { // GET list of print queue items and status
    return {code: 200, body: {
      status: 'ready',
      items: robopaint.printQueue.length,
      queue: robopaint.printQueue
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
        robopaint.printQueue.push({
          status: 'waiting',
          options: options,
          pathCount: e.pathCount,
          startTime: d.toISOString(),
          svg: localStorage['svgedit-default'],
        });

        res.status(201).send(JSON.stringify({
          status: 'verified and added to queue',
          uri: '/robopaint/v1/print/' + (robopaint.printQueue.length - 1),
          item: robopaint.printQueue[robopaint.printQueue.length - 1]
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


cncserver.createServerEndpoint('/robopaint/v1/print/:qid', function(req, res) {
  var qid = req.params.qid;

  if (req.route.method == 'get') { // Is this a GET request?
    if (robopaint.printQueue[qid]){
      return {code: 200, body: robopaint.printQueue[qid]};
    } else {
      return [404, 'Queue ID ' + qid + ' not found'];
    }
  } else {
    return false; // 405 - Method Not Supported
  }

});
