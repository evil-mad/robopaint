var app = require('app');  // Module to control application life.
var BrowserWindow = require('browser-window');  // Module to create native browser window.
var dialog = require('dialog');

// Report crashes to our server.
//require('crash-reporter').start();

// Handle app startup with command line arguments from squirrel (windows).
function start() {
  // Process squirrel update/install command line.
  if (process.platform === 'win32') {
    SquirrelUpdate = require('./squirrel-update');
    var squirrelCommand = process.argv[1];
    if (SquirrelUpdate.handleStartupEvent(app, squirrelCommand)) {
      // If we processed one, quit right after.
      return false;
    }
  }

  windowInit();
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the javascript object is GCed.
var mainWindow = null;

function windowInit() {
  // Quit when all windows are closed.
  app.on('window-all-closed', function() {
    // On OSX it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform != 'darwin') {
      app.quit();
    }
  });

  // This method will be called when Electron has done everything
  // initialization and ready for creating browser windows.
  app.on('ready', function() {

    // Create the main application window.
    mainWindow = new BrowserWindow({
      center: true,
      'min-width': 600,
      'min-height': 420,
      width: 980,
      height: 600,
      resizable: true,
      icon: "resources/images/watercolorbot_icon.png",
      title: "RoboPaint!"
    });

    // Window wrapper for dialog (can't include module outside of this) :P
    mainWindow.dialog = function(options, callback) {
      dialog['show' + options.type](mainWindow, options, callback);
    }

    // and load the index.html of the app.
    mainWindow.loadUrl('file://' + __dirname + '/../../main.html');

    mainWindow.onbeforeunload = function(e) {
      console.log('I do not want to be closed');

      // Unlike usual browsers, in which a string should be returned and the user is
      // prompted to confirm the page unload, Electron gives developers more options.
      // Returning empty string or false would prevent the unloading now.
      // You can also use the dialog API to let the user confirm closing the application.
      return false;
    };


    mainWindow.on('close', function(){
      console.log('MAINWINDOWCONTROL CLOSE');
      return false;
    }); // Catch close event

    // Emitted when the window is closed.
    mainWindow.on('closed', function() {
      // Dereference the window object, usually you would store windows
      // in an array if your app supports multi windows, this is the time
      // when you should delete the corresponding element.
      mainWindow = null;
    });
  });
}

start();
