/**
 * @file Helper program to assist in installing the correct OS specific compiled
 * binary for node-serialport.
 * This will only be run by the postinstall trigger if `npm install` is run with
 * no packages. `npm install` will run this, `npm install serialport` will not.
 */

var fs = require('fs-plus');
var path = require('path');
var finder = require('fs-finder');
var spawn = require('child_process').spawn;

var dir = process.platform + '-' + process.arch;
var binFile = path.join('build', 'bin', 'serialport', dir, 'serialport.node');

// If the source folder is there, find the destination and replace it.
if (fs.existsSync(binFile)) {
  console.log('Placing pre-compiled binary for serialport...');
  var badBin = finder.from('node_modules').find(path.join('Release', 'serialport.node'));
  console.log(badBin[0]);
  try {
    fs.removeSync(badBin[0]);
    fs.createReadStream(binFile).pipe(fs.createWriteStream(badBin[0]));
    console.log('Serialport should now be using the correct version. Run RoboPaint with `npm start`');
  } catch (e) {
    console.error('Problem placing pre-compiled binary.', e);
  }
} else {
  var npmArgs = [
    'install', '--runtime=electron',
    '--disturl=https://atom.io/download/atom-shell', '--target=1.0.2',
    'serialport'];

  console.log('Unable to place pre-compiled serialport binary, unupported OS/architechture.');
  console.log(`Using npm to build serialport for Electron on ${dir}.`);
  console.log('This will fail if you do not have the necessary build tools.');
  console.log(`> npm ${npmArgs.join(' ')}`);

  var npmCmd = spawn('npm', npmArgs);

  npmCmd.stdout.pipe(process.stdout);
  npmCmd.stderr.pipe(process.stderr);

  npmCmd.on('close', (code) => {
    if (code !== 0) {
      console.error(`Problem building serialport for Electron`);
    }
  });

}
