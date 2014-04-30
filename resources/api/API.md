# RoboPaint HTTP API [v1]

This file defines and documents all the available RESTful API resources and
configuration for RoboPaint, which extends the already
[existing API](https://github.com/techninja/cncserver/blob/master/API.md) for
[CNC Server](https://github.com/techninja/cncserver) running underneath it.
RESTful practices are all HTTP based and accessible by any system or devices
that can access a web page. METHODs are used to differentiate what is being done
to a particular resource.

All resources should be requested with, and *return* JSON data, regardless of
status code. Though for non-GET requests, you can pass variables as either JSON,
form encoded, or any other well-known standard, as long as you set the
`Content-Type` header to match.

In each request example below, the server is assumed to be added to the
beginning of each resource, E.G.: `GET http://localhost:4242/robopaint/v1/print` will `GET` the
print status of the bot from a server plugged into the local computer, at the default
port of `4242`. Your host and port may be different, so they're excluded.

If you want to test any of these, try out
[Postman for Google Chrome](https://chrome.google.com/webstore/detail/postman-rest-client/fdmmgilgnpjigdojojpjoooidkmcomcm).
It allows for easy testing of any RESTful HTTP method to even remote servers.

![f1a930d0641920f074aeb32ebc512408](https://f.cloud.github.com/assets/320747/920613/894669a2-fee1-11e2-8349-dc6ad8cd805d.png)

An easy to use Postman JSON config file is now available in the repo
[here](https://raw.github.com/evil-mad/robopaint/master/resources/api/robopaint_api.postman.json).
This supplies all the current API resources in a simple click and send test
environment, just import, and setup two global variables `cncserver-host` and
`cncserver-port`. If running on just one computer, these will be by default
`localhost` and `4242` respectively.


***NOTE:*** *Any comments visible in responses/JSON payload in the documentation
below are just to help make it easier to understand what's being sent. Comments
are* ***not allowed*** *in JSON data and will not exist in returned data.*

## 1. Print
The `print` resource is meant to act as the input/output for anything having
directly to do with drawing an SVG automatically. For the WaterColorBot, this
is all about painting a single, full color image. This allows for simple
interchange and automatic painting remotely of any SVG image sent over.

This mode and accompanying API are only available in RoboPaint 0.7.5+, and you
must manually enable the "Remote Paint" mode in the GUI, both through the
advanced settings menu, and then switching to the mode via the button in the
toolbar. The mode will also be disabled after every run and must be re-enabled
when the bot has become ready again.

### GET /robopaint/v1/print
Gets the current printing status. This includes a simplified view of the print
queue, so it will include all past and current print items.

#### Request
```javascript
GET /robopaint/v1/print
```

#### Response
```javascript
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

{
    "status": "busy",                           // Status of the print API
    "items": 1,                                 // Number of items
    "queue": [                                  // Full queue output
        {
            "uri": "/robopaint/v1/print/0",     // URI of item detail resource
            "name": "Blue Star",                // Name given to item
            "status": "printing"                // Status of individual item
        },
    ]
}
```

##### Usage Notes
 * `status` returned is specific to the feature in general. Allowed values are:
  * `disabled`: Default, any writing requests will alert client to enable remote
print mode in the RoboPaint GUI
  * `ready`: Once mode has been enabled and we're reayd to take items to print.
  * `busy`: If an item is printing, another item can't be added to the queue.
This is a somewhat temporary restriction of the API, and matters less as all
supported devices can really only print one item at a time anyways.
 * Queue will be emptied on every application start, and will contain every item
sent and verified, including "deleted" ones, marked as canceled.


* * *


### POST /robopaint/v1/print
This attempts to create a print queue item from an SVG (and a few options). The
following examples will describe a single submit, and most of the possible
responses.

#### Request Example
```javascript
POST /robopaint/v1/print
Content-Type: application/json; charset=UTF-8

{
    "options": {                            // Required Options Object
        "name": "Red Star",                 // Required name
        "noresize": true                    // Optional high level option
        "settingsOverrides" : {             // RoboPaint settings overrides
            "filltype": "line-triangle",
            "maxpaintdistance": 6040,
            "strokeprecision": 3,
            "paintspeed": 90
        }
    },
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\">..."
}

```

#### Response Example #1 (Remote Paint mode disabled)
```javascript
HTTP/1.1 403 Forbidden
Content-Type: application/json; charset=UTF-8

{
    "status": "The SVG import API is currently disabled. Enable it in settings and then click the button in the RoboPaint GUI."
}

```

#### Response Example #2 (RoboPaint busy painting)
```javascript
HTTP/1.1 503 Service Unavailable
Content-Type: application/json; charset=UTF-8

{
    "status": "Cannot add to queue during ongoing print job."
}

```

#### Response Example #3 (Bad SVG content)
```javascript
HTTP/1.1 406 Not Acceptable
Content-Type: application/json; charset=UTF-8

{
    "status": "content verification failed",
    "reason": {
        "message": "A Node was inserted somewhere it doesn't belong.",
        "name": "HierarchyRequestError",
        "code": 3
    }
}

```

#### Response Example #4 (Success!)
```javascript
HTTP/1.1 201 Created
Content-Type: application/json; charset=UTF-8

{
    "status": "verified and added to queue",
    "uri": "/robopaint/v1/print/3",               // URI the item can be seen at
    "item": {
        ...                                       // Original item payload
        "status": "waiting"                       // Current item status
        "pathCount": 8,                           // Number of paths in SVG
        "percentComplete": 0,                     // Percent complete
        "startTime": "2014-07-29T07:49:20.850Z",  // ISO date of start time
        "endTime": null,                          // End Time
        "secondsTaken": null                      // Time taken, in seconds
    }
}

```

##### Usage Notes
 * As noted, `svg`, `options`, and `options.name` are all required, and the API
will deny any request that doesn't have these
 * The SVG field should be the full XML from an SVG file, escaped properly, or
JSON encoding will be broken. Most JSON formatters handle this automatically.
 * The SVG format errors come from one of three places: the XML DOM parser,
the method-draw cleaning/open routine, or RoboPaint's custom cleaning functions.
You may not get a clear idea from which one it comes, or exactly what's wrong,
but most of the time, all that's needed is to open the document in Inkscape or
another program, remove any odd groupings or clipping paths, save and try again.
 * Only the `noresize` option has been added so far as an explicit import option.
When set to true, image will not "fit to page". Ignore this setting to allow
default SVG fitting (small images will enlarge, large or out of bounding box
images will size down).
 * The optional `settingsOverrides` option is intended to directly override
RoboPaint settings pertaining to print aesthetics for that print only. See
[Appendix a.](#appendix-a) for the white-listed set of overridable settings and
their acceptable value ranges.


* * *


### GET /robopaint/v1/print/{queueID}
Get a specific queue item details by queue ID.

#### Request
```javascript
GET /robopaint/v1/print/1
```

### Response
```javascript
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

{
    "status": "complete",
    "options": {
        "name": "Red Star",
        "noresize": true
    },
    "pathCount": 1,
    "percentComplete": 100,
    "startTime": "2014-07-29T08:28:18.308Z",
    "endTime": "2014-07-29T08:30:56.015Z",
    "secondsTaken": 157.707,
    "svg": "<svg xmlns=...",
    "printingStatus": "AutoPaint Complete!"
}
```

##### Usage Notes
 * `printingStatus` is the always updating status text given by RoboPaint as
a "play-by-play" of what the bot is doing, also visible on the GUI during
painting.
 * `endTime` and `secondsTaken` are only set after full painting completion or
cancellation


* * *


### DELETE /robopaint/v1/print/{queueID}
Cancel a currently printing queue item.

#### Request
```javascript
DELETE /robopaint/v1/print/1
```

### Response
```javascript
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

{
    "status": "cancelled",
    ...                       // Complete queue item object
}
```

##### Usage Notes
 * Will only work on currently printing or waiting queue items, otherwise will
return `406 Not Acceptable`.


* * *


## Appendix A.
`options.settingsOverride` for printing preferences is a key: value pair
intended to allow per print changing of any of the following white-listed
RoboPaint settings during POST request for new images. These are the allowable
machine names to be used as keys, and the value ranges to be used*.

| Name                  | Machine Name       |Default | Acceptable Range  |
| --------------------- | ------------------ | -----  | -----  |
| Latency Offset        | `latencyoffset`    | 20 | -50 to 200 (ms) |
| Move Speed            | `movespeed`        | 75 | 10 to 90 (%) |
| Paint Speed           | `paintspeed`       | 75 | 10 to 90 (%)  |
| Fill Type             | `filltype`         | `line-straight` | `line-straight`, `line-triangle`, `line-sine`, `spiral` |
| Line Fill Angle       | `fillangle`        | 0 | 0, 45, 90 (degrees) |
| Line Fill Spacing     | `fillspacing`      | 10 | 1 to 50 (px) |
| Paint Refill Distance | `maxpaintdistance` | 8040 | 500 to 20000 (stepper steps, 16.7mm per) |
| Fill Precision        | `fillprecision`    | 14 | 1 to 35 |
| Stroke Precision      | `strokeprecision`  | 5 | 1 to 15 |
| Brush Overshoot       | `strokeovershoot`  | 6 | 0 to 20 (mm) |
| Connect Gaps?         | `gapconnect`       | 1 | 1 or 0 (boolean) |

* *Most of the internal functions that use these values have sanity checks,
though some do not and will technically allow values outside their stated ranges.
Any values outside these ranges or types of course can not be expected to actually work.*
