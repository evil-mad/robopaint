RoboPaint!
=============

Software for drawing robots, and your
[friendly painting robot kit, the WaterColorBot](http://watercolorbot.com)!

## Downloads / Install
Go to the [releases page](https://github.com/evil-mad/robopaint/releases) and
pick out the latest release, then choose the package for your system by clicking
the green download button for Windows, Linux or Mac.

*Linux users: Simply copy folder from zip file to
Desktop or other folder, then run executable.
[System installer in the works](https://github.com/evil-mad/robopaint/issues/73)!*


## Features
 * Real-time SVG preview and shape tracing, with fully automatic path filling,
color similarity chooser, and outline manager. Load your SVG and just click to
paint automatically!
 * Single path based tracing for fills, allowing for an infinite array of
creative path based crosshatches.
 * Built-in SVG editor and importer from the open-source project
[Method-Draw](https://github.com/duopixel/Method-Draw)
 * Optional visual path position checking, ensuring that overlapping or invisible
portions of paths aren't drawn.
 * Centralized codebase for all platforms allows for easy hacking.
 * [Scratch](http://scratch.mit.edu/) and [Snap](http://snap.berkeley.edu)
support via [WaterColorBlocks](https://github.com/evil-mad/WaterColorBlocks).
 * Modular code addition via
[RoboPaint Modes](https://github.com/evil-mad/robopaint/blob/master/resources/modes/README.md):
Control your bot with a simple web app leveraging everything already written for
RoboPaint!


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
#### Node-webkit (v0.10.x)
RoboPaint is an HTML5/Node.js application that runs in
[node-webkit](https://github.com/rogerwang/node-webkit). Though the index.html
code may somewhat render in a regular browser window, it's still a node.js
application that requires its low level file access and other APIs. Download a
release from their main page above, extract the files from the zip to a
working folder. For windows, I use `C:\nw\`, which you can then add to your PATH
environment variable. For Linux, I use `~\.nw\`, with an alias in my ~\.bashrc
file like `alias nw='~/.nw/nw'`.

#### Node.js & npm (v0.10+)
Required for automated builds and installation content. See
[nodejs.org](http://nodejs.org) for installation for your operating system. Node
Package Manager is usually installed along with it.

#### Build Tools!
* CNC Server uses node-serialport, a low-level partially native module that needs
to be built/compiled for every OS.
* These are pre-compiled for each release in
the [robopaint-build](https://github.com/evil-mad/robopaint-build/) repository,
which you can easily use to replace the node_modules folder within cncserver
* *BUT*, if you're experimenting with new versions of modules, you're going to
need to be able to build your own, so continue on.

##### Windows
* You'll need the free download version of
[Visual Studio Express 2013](http://www.microsoft.com/visualstudio/eng/2013-downloads#d-2013-express)
which will have the command line tools required for builds.

##### OSX
* Install Xcode and the CLI Developer tools.

##### Linux
* This is the easiest, as most [FOSS](http://en.wikipedia.org/wiki/FOSS) ships
as source to be built on the target machines, so you shouldn't have to install
anything new for this at all.

#### Building natively for node-webkit with `node-pre-gyp` and `nw-gyp`
* Run `npm install node-pre-gyp -g` to install the the node native builder, and
`npm install nw-gyp -g` for the node-webkit specific version. See the
node-webkit native module builder
[wiki page](https://github.com/rogerwang/node-webkit/wiki/Build-native-modules-with-nw-gyp)
for more help/info.
* Because the previous commands use the `-g` flag, they install globally and
will require administrator rights, so run with a `sudo` prefix for Linux/Mac.

### Project installation
1. Pull down/clone your fork of the RoboPaint repository with git (or just
download a zip of the files).
2. In your terminal/command line interface, go to that folder and run `npm install`
 * This will run through all the required module dependencies and install/build
them to the best of its ability.
 * This will also run a script to rebuild `serialport` for node-webkit. This script only works on Linux / Mac / Unix. The script will prompt you for you archetcture, select `1` for a 32 bit system or `2` for a 64 bit system. If the script has errors file an issue.
* If the script fails or you are running Windows, navigate to the new
`node_modules/cncserver/node_modules/serialport` folder, and run
`node-pre-gyp build --runtime=node-webkit --target=0.10.5 --target_arch=ia32`,
for a 32 bit system or `node-pre-gyp build --runtime=node-webkit --target=0.10.5 --target_arch=x64` for a 64 bit system, substituting your target node-webkit version.
   * For Windows, if you have multiple versions of Visual Studio, use the flag
`--msvs_version=2012`, substituting the version of Visual Studio you'd like to
build with.
   * For the moment, the default build is put into the wrong folder. Rename/move the
folder from `serialport/build/v1.4.6/Release/node-webkit-v0.10.5-darwin-x64` to
where it claims to be looking for it (usually replacing `v0.10.5` with `v14`).
This should be fixed soon.
 * If there are build issues here, the problems may be many and varied, and
almost always have to do with either the
[node-serialport](https://github.com/voodootikigod/node-serialport) or
[nw-gyp](https://github.com/rogerwang/nw-gyp) projects.
4. That's it! You should now be installed and ready to hack. To update CNC server
just run `npm install cncserver` from the project root and it should pull from
the latest master.

### Running RoboPaint from source
* On Linux from RoboPaint root, I simply run `nw ./`, and console output is
piped to the terminal as the main program window opens.
* On Windows, in the command window from `C:\nw`, I just run `nw C:\robopaint`,
or just drag the folder to the executable.
* On Mac put `/Applications/node-webkit.app/Contents/MacOS` or the directory to node-webkit in your path. Then run `node-webkit ./` from the RoboPaint root directory.
* I also highly recommend setting the `package.json` toolbar flag to `true` for
far easier debugging.

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
