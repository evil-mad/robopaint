# RoboPaint Modes
Everything you need to know to make your own!

## What is a mode?
A mode for robopaint shows up as a bubble on the home screen, and a tool bar tab
over every other mode and the home screen. These modes are fully complete web
applications with a base HTML file that is loaded into a controller sub-window
iFrame by RoboPaint and load shared JS/css or anything else you like.

The "core" modes are `edit` and `paint`, with more coming as we think of them.
Each mode is intended to interact with the API in its own unique way, and
therefore allows an infinite set of functionality to piggyback on the existing
featureset and connectivity within RoboPaint.

## File Structure
Modes have **two** minimum required files: `package.json` and some root
`.html` file configured within it.

That's it! Everything else about how the page works is dealt with inside the
`package.json` and your html file.

```
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


```json
{
  "name": "mymode", // The machine name of the mode. Lowercase, no spaces, same as folder.
  "version": "1.0",
  "type": "robopaint_mode", // If not equal to this, it will be ignored.
  "icon": "icon-brush", // Icon for the tool bar. CSS class, or src of image.
  "weight": 8, // How far left or right to place in the navigation
  "word": "MyMode",  // The word to be placed in the bubble navigation
  "core": false, // If true, will be available by default
  "description": "My mode!", // Text will show on mode hover
  "main": "mymode-index.html", // The path to the HTML file to open relative to this folder
  "author": "makersylvia",
  "license": "MIT"
}
```

## HTML/JS API
In your HTML, just include all your CSS, and JS resources as you normally would.
Your JS should have full access to `window.parent.settings` for static global
configuration, and `window.parent.statedata` for volatile state data, and
`window.parent.robopaint` for high level actions and utilities.

## Contribute back
If you'd like to get ***your*** mode back into the RoboPaint project,
just follow the instructions for contributing back with a pull request at the
bottom of [the main project readme](https://github.com/evil-mad/robopaint).