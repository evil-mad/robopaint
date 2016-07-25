/**
 * @file Helper program to assist in installing the correct OS specific compiled
 * binary for node-serialport.
 */

var fs = require('fs-plus');
var path = require('path');

var file = 'serialport.node';
var dir = process.platform + '-' + process.arch;
var binDir = path.join('build', 'bin', 'serialport', dir);

// If the source folder is there, find the destination and replace it.
if (fs.existsSync(binDir)) {
  //console.log('Placing pre-compiled binary for serialport...');

  var nsDir = require.resolve('serialport');
  console.log(nsDir);
  /*if (fs.existsSync(nsDir)) {

  }*/
} else {
  console.log('Skipping placing pre-compiled serialport binary, unupported OS/architechture.');
}
