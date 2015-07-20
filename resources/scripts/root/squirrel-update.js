var ChildProcess = require('child_process');
var fs = require('fs-plus');
var path = require('path');

var appFolder = path.resolve(process.execPath, '..');
var rootAppFolder = path.resolve(appFolder, '..');
var binFolder = path.join(rootAppFolder, 'bin');
var updateDotExe = path.join(rootAppFolder, 'Update.exe');
var exeName = path.basename(process.execPath);

spawn = function(command, args, callback) {
  var error, spawnedProcess, stdout;
  stdout = '';
  try {
    spawnedProcess = ChildProcess.spawn(command, args);
  } catch (_error) {
    error = _error;
    process.nextTick(function() {
      return typeof callback === "function" ? callback(error, stdout) : void 0;
    });
    return;
  }
  spawnedProcess.stdout.on('data', function(data) {
    return stdout += data;
  });
  error = null;
  spawnedProcess.on('error', function(processError) {
    return error != null ? error : error = processError;
  });
  return spawnedProcess.on('close', function(code, signal) {
    if (code !== 0) {
      if (error == null) {
        error = new Error("Command failed: " + (signal != null ? signal : code));
      }
    }
    if (error != null) {
      if (error.code == null) {
        error.code = code;
      }
    }
    if (error != null) {
      if (error.stdout == null) {
        error.stdout = stdout;
      }
    }
    return typeof callback === "function" ? callback(error, stdout) : void 0;
  });
};

spawnUpdate = function(args, callback) {
  return spawn(updateDotExe, args, callback);
};

isAscii = function(text) {
  var index;
  index = 0;
  while (index < text.length) {
    if (text.charCodeAt(index) > 127) {
      return false;
    }
    index++;
  }
  return true;
};

createShortcuts = function(callback) {
  return spawnUpdate(['--createShortcut', exeName], callback);
};

updateShortcuts = function(callback) {
  var desktopShortcutPath, homeDirectory;
  if (homeDirectory = fs.getHomeDirectory()) {
    desktopShortcutPath = path.join(homeDirectory, 'Desktop', 'RoboPaint.lnk');
    return fs.exists(desktopShortcutPath, function(desktopShortcutExists) {
      return createShortcuts(function() {
        if (desktopShortcutExists) {
          return callback();
        } else {
          return fs.unlink(desktopShortcutPath, callback);
        }
      });
    });
  } else {
    return createShortcuts(callback);
  }
};

removeShortcuts = function(callback) {
  return spawnUpdate(['--removeShortcut', exeName], callback);
};

exports.spawn = spawnUpdate;

exports.handleStartupEvent = function(app, squirrelCommand) {
  switch (squirrelCommand) {
    case '--squirrel-install':
      createShortcuts(function() {
        return app.quit();
      });
      return true;
    case '--squirrel-updated':
      updateShortcuts(function() {
        return app.quit();
      });
      return true;
    case '--squirrel-uninstall':
      removeShortcuts(function() {
        return app.quit();
      });
      return true;
    case '--squirrel-obsolete':
      app.quit();
      return true;
    default:
      return false;
  }
};
