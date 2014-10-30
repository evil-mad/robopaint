# RoboPaint Modes
Everything you need to know about this awesome feature!

## What is a "mode"?
A mode for robopaint shows up as a bubble on the home screen, and a tool bar tab
over every other mode and the home screen. These modes are complete web
applications with a base HTML file that is loaded into a controller sub-window
iFrame by RoboPaint and loads shared JS/CSS or anything else you like.

The "core" modes are `edit` and `paint`, with more coming as we think of them.
Each mode is intended to interact with the API in its own unique way, and
therefore allows an infinite set of functionality to piggyback on the existing
featureset and connectivity within RoboPaint.

## File Structure
Modes have **two** minimum required files: `package.json` and some root
`.html` file configured within it.

That's it! Everything else about how the page works is dealt with inside the
`package.json` and your html file.

```javascript
 modes/
 |- mymode/
 |-- package.json
 |-- mymode.html
 |-- mymode.css
 |-- mymode.js
```

We recommend simply copying one of the existing modes that comes with RoboPaint,
and renaming the folder and the other files.

## File Format: package.json
Though not officially a node module, we take a cue from NPM and use the "open"
format for `package.json` to hold all top level mode configuration. See the
comments below for explanation on the non-obvious keys.


```javascript
{
  "name": "mymode", // The machine name of the mode. Lowercase, no spaces, same as folder.
  "version": "1.0",
  "type": "robopaint_mode", // If not equal to this, it will be ignored.
  "icon": "icon-brush", // Icon for the tool bar. ICON CSS class (image replacement coming soon).
  "weight": 8, // How far left or right to place in the navigation
  "word": "MyMode",  // The word to be placed in the bubble navigation
  "core": false, // If true, will be available by default
  "description": "My mode!", // Text will show on mode hover
  "title": "My Mode Title",  // If not core, will show in settings with checkbox to enable
  "detail": "Lots of detail text", // If not core, will show in settings below title
  "main": "mymode-index.html", // The path to the HTML file to open relative to this folder
  "author": "makersylvia",
  "license": "MIT"
}
```

## HTML/JS API
In your HTML, add your CSS references as usual, but for JavaScriptcode, you'll
want to use `require.js`. Place a single script tag in your `<head>` tag
with the `data-main` attribute set to the name of your central js file, without
the extension, like this:

```html
<script data-main="example" src="../require.js"></script>
```

Inside of your central JS file, use the `robopaintRequire` function to load
RoboPaint common libraries by a short name, or other local libraries. All of
these includes share a `$` jQuery object, the central/global `robopaint` object,
and the more specialized/local `cncserver` object. See the following excerpt
from the example text creation mode:

```javascript
robopaintRequire(['hersheytext', 'svgshared', 'wcb', 'commander', 'paths'],
  function($, robopaint, cncserver) {
    // Everything is ready, code goes here!

  }
);
```

Your HTML page and JS code should now have full access to `robopaint.settings`
for static global configuration, and `robopaint.statedata` for volatile state
data, and `robopaint.api` for CNCServer API wrapper actions and utilities. Not
to mention `cncserver.cmd.run` for quick sequential moves and actions like the
following to buffer the commands to pick a color, and draw a square, then park.

```javascript
cncserver.cmd.run([
  ['tool', 'color3'],
  'up',
  ['move', {x: 20, y: 20}],
  'down',
  ['move', {x: 400, y: 20}],
  ['move', {x: 400, y: 400}],
  ['move', {x: 20, y: 400}],
  ['move', {x: 20, y: 20}],
  'park'
]);
```

Check out the
[`cncserver.client.commander`](/evil-mad/robopaint/blob/master/resources/scripts/cncserver.client.commander.js)
library for more commands and options, with better documentation on the way.

And that's just the start! Experiment with the example mode, make it better,
tweak it, or even just toss it all out. It's all up to you.

## Contribute back
If you'd like to get ***your*** mode back into the RoboPaint project,
just follow the instructions for contributing back with a pull request at the
bottom of [the main project readme](https://github.com/evil-mad/robopaint).
