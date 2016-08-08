/**
 * @file Helper program to assist in installing the correct OS specific compiled
 * binary for node-serialport.
 */

var fs = require('fs-plus');
var path = require('path');
var finder = require('fs-finder');

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
  console.log('Skipping placing pre-compiled serialport binary, unupported OS/architechture.');
}
