var app = require('app');  // Module to control application life.
var BrowserWindow = require('browser-window');  // Module to create native browser window.

// Report crashes to our server.
//require('crash-reporter').start();

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the javascript object is GCed.
var mainWindow = null;

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

  console.log(app.getVersion());

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

  // and load the index.html of the app.
  mainWindow.loadUrl('file://' + __dirname + '/main.html');

  // Open the devtools.
  mainWindow.openDevTools();

  // Emitted when the window is closed.
  mainWindow.on('closed', function() {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
});
