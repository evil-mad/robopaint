RoboPaint!
=============

[![Join the chat at https://gitter.im/evil-mad/robopaint](https://badges.gitter.im/evil-mad/robopaint.svg)](https://gitter.im/evil-mad/robopaint?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

Software for drawing robots, and your
[friendly painting robot kit, the WaterColorBot](http://watercolorbot.com)!

## Downloads / Install
[Click here](https://github.com/evil-mad/robopaint/releases/tag/v2.0.0-Beta.2.2016-07-29)
to download the current beta release. This release has many changes that improve
the functinality of RoboPaint. Since this a beta release you may expierence bugs.
If you do please report it by creating an issue [here](https://github.com/evil-mad/robopaint/issues)

[Click here](https://github.com/evil-mad/robopaint/releases/latest) for the
latest official release, then click the green button below the release notes that matches
your operating system to download the install package.

*Linux users: Simply copy folder from zip file to your desktop or other folder,
then run the executable inside.
[System installer in the works](https://github.com/evil-mad/robopaint/issues/73)!*


## Features
 * Real-time SVG preview and shape tracing, with fully automatic path filling,
color similarity chooser, and outline manager. Load your SVG and just click to
paint automatically!
 * Single path based tracing for fills, allowing for an infinite array of
creative path based crosshatches.
 * Built-in SVG editor and importer from the open-source project
[Method-Draw](https://github.com/duopixel/Method-Draw)
 * Optional visual path position checking, ensuring that overlapping or
invisible portions of paths aren't drawn.
 * Centralized codebase for all platforms allows for easy hacking.
 * [Scratch](http://scratch.mit.edu/) and [Snap](http://snap.berkeley.edu)
support via [WaterColorBlocks](https://github.com/evil-mad/WaterColorBlocks).
 * Modular code addition via RoboPaint Modes:
Control your bot with a simple web app leveraging everything already written for
RoboPaint!
 * Allows programatic (including remote) painting and drawing via the high level [RoboPaint API](https://github.com/evil-mad/robopaint-mode-remote/blob/master/API.md), the low level [cncserver API](https://github.com/techninja/cncserver/blob/master/API.md), or the simplified (HTTP get-only) [Scratch API](https://github.com/techninja/cncserver/blob/master/scratch/SCRATCH.API.md)

## Projects:
RoboPaint is made of modes that are their very own independent projects! This
project repository holds all the code to manage the modes, global settings,
running the API, and the connection to a robot. The modes are their own web
applications that run (almost) completely on their own through the mode API.

Here's a list of all the modes that currently ship with RoboPaint. If you have
an issue or a feature to add to any of these, open it in the mode's own project
instead of this one.
* **[Edit mode](https://github.com/evil-mad/robopaint-mode-edit)**
  * For creating/editing/importing SVG art that will be saved to a shared
  location that modes can use as they choose.
* **[Print Mode](https://github.com/evil-mad/robopaint-mode-print)**
  * An automatic paint mode meant to handle most SVG art easily and without much
  customization
* **[Manual Mode](https://github.com/techninja/robopaint-mode-manual)**
  * An experimental paint mode for advanced customization of prints.
* **[Remote Print Mode](https://github.com/evil-mad/robopaint-mode-remote)**
  * Allow for high level sending of SVGs for printing directly with or without
  user interaction via an API.
* **[Spiral Mode (experimental)](https://github.com/techninja/robopaint-mode-spiral)**
  * A mode to take raster images and convert them into spiral art using adjusted
  brush heights for luminosity.
* **[Example Text Mode (experimental)](https://github.com/techninja/robopaint-mode-example)**
  * An example mode for rendering text, and to show developers how to create a
  mode using most of the available modules and API.

## Problems?
***Stuck on something?*** Submit an issue! Click the
[issues tab](https://github.com/evil-mad/robopaint/issues) and see if someone
is covering your question or problem, if not, ask away! Someone will be around
to help soon.

***Know how to fix a problem? Or want to add a new feature??*** Submit a pull
request! Just fork the repo using the button on the
[RoboPaint github homepage](https://github.com/evil-mad/robopaint), and
this will give you your own version of RoboPaint. Make your change in a few
commits to your branch, then click the pull request button at the top! Talk
about what changes you made and submit. A maintainer of the project will check
your work, possibly ask you to fix a few more things, and then if all is well,
your work will be merged into the project!

## Contributing to the Project
Want to help be a part of RoboPaint? Maybe spruce it up, or hack it to bits into
your own thing? Here's a rough and tumble guide to getting set up:

### Pre-requisites
#### Electron
RoboPaint is an HTML5/Node.js application that runs in
[electron](https://electron.atom.io/). Though the main.html
code may somewhat render in a regular browser window, it's still a node.js
application that requires its low level file access and other APIs. This is
installed via `npm install` when run at the root.

#### Install Node for node & npm
Required for automated builds and installation content. The build and
dependency system all uses [node.js](http://nodejs.org). `npm` is installed
along with it. If you already have node installed, you can skip this part.

#### Build Tools!
* CNC Server uses the [node-serialport module](https://github.com/EmergingTechnologyAdvisors/node-serialport),
a low-level partially native module that needs to be built/compiled for every
OS. We've included the top four common OS & architecture combinations, so if
your dev system is one of those, the file will be copied over after
`npm install` and you should be in the clear to run immediately.
* If you're experimenting with new versions of modules, or are running on a
different arch/OS, you're going to need to be able to build your own, so
continue on.

##### Windows
* You'll need the free download version of
[Visual Studio Express 2013](http://www.microsoft.com/visualstudio/eng/2013-downloads#d-2013-express)
which will have the command line tools required for builds.

##### OSX
* Install Xcode and the CLI Developer tools.
* You _might_ be able to [skip installing Xcode to get the GCC tools alone](http://osxdaily.com/2012/07/06/install-gcc-without-xcode-in-mac-os-x/).

##### Linux
* This is the easiest, as most [FOSS](http://en.wikipedia.org/wiki/FOSS) ships
as source to be built on the target machines, so you shouldn't have to install
anything new for this at all.

#### Building natively for Electron
1. Pull down/clone your fork of the RoboPaint repository with git (or just
  download a zip of the files).

  2. In your terminal/command line interface, go to that folder and run
  `npm install` to install dependencies, if there is not a prebuilt serialport
  module for your architecture npm will try to build serialport for Electron.
  You may see some errors, but it should re-compile everything that needs it.

  3. That's it! You should now be installed and ready to hack. To update CNC server
  just run `npm install cncserver` from the project root and it should pull from
  the latest master, and you'll likely need to rebuild serialport for Electron
  with `npm run fix-serialport`.


### Running RoboPaint from source
* Assuming this is all working, get yourself to the root of the repo and simply
run `npm start`, this will run it's local version of electron pointed at the
repository root.
* Remember: Alt+Ctrl+I to open the debug console, Ctl+R will reload if the
console is open, and a reload only reloads the contents of the window, and will
_**not**_ reload the application main process.

## ETC.

This open source project is built on top of the
[CNC server project](http://github.com/techninja/cncserver) which provides
a speedy framework of API calls to interact with serial connected drawing
robots, while RoboPaint is the clean interface in an easy to install app!

All code MIT licensed. Created by [TechNinja](https://github.com/techninja),
with support and collaboration from
[Evil Mad Scientist](http://evilmadscientist.com). Don't forget, you can
discover more crazy maker fun with
[Sylvia's Super-Awesome Maker Show](http://sylviashow.com)!
