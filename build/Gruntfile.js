/**
 * @file RoboPaint Build gruntfile: provides basic configuration and build tasks
 * for creating distribution release files.
 */

var path = require('path');
var fileURL = require('file-url');

module.exports = function(grunt) {
  // Load the plugins...
  grunt.loadNpmTasks('grunt-electron');

  // Load all platform specific tasks:
  switch (process.platform) {
    case 'win32':
      grunt.loadNpmTasks('grunt-electron-installer');
      break;

    case 'darwin':
      grunt.loadNpmTasks('grunt-appdmg');
      break;

    default:
      grunt.loadNpmTasks('grunt-electron-installer-debian');
      break;
  }

  // Load the tasks in 'tasks' dir.
  grunt.loadTasks('tasks');

  // Set all subsequent paths to the relative to the root of the repo
  grunt.file.setBase(path.resolve('..'));

  var appInfo = grunt.file.readJSON('package.json');
  var numericVersion = appInfo.version.split('-')[0];

  // All paths/patterns to clean from dist build.
  var buildIgnore = [
    'build/dist',
    'build/node_modules',
    'build/tasks',
    'build/package.json',
    'build/Gruntfile.js',
    'node_modules/electron-*',
    'node_modules/grunt*',
  ].join('|');

  // Build configuration:
  grunt.initConfig({
    name: appInfo.name,
    pkg: appInfo,
    electron: {
      macbuild: {
        options: {
          name: appInfo.releaseInfo.appName,
          dir: './',
          out: 'build/dist',
          icon: 'build/resources/mac/app.icns',
          version: appInfo.electronVersion,
          platform: 'darwin',
          arch: 'x64',
          'osx-sign': {
            identity: 'Developer ID Application: Evil Mad Science LLC'
          },
          ignore: buildIgnore,
          'app-version': appInfo.version,
          overwrite: true,
          prune: true,
          'app-bundle-id': appInfo.name + '-main',
          'helper-bundle-id': appInfo.name + '-helper',
        }
      },
      winbuild: {
        options: {
          name: appInfo.releaseInfo.appName,
          dir: './',
          out: 'build/dist',
          icon: 'build/resources/win32/app.ico',
          version: appInfo.electronVersion,
          platform: 'win32',
          arch: 'x64,ia32',
          ignore: buildIgnore,
          'app-version': appInfo.version,
          overwrite: true,
          prune: true,
          'version-string': {
            CompanyName: appInfo.releaseInfo.company,
            LegalCopyright: appInfo.releaseInfo.copyright,
            FileDescription: appInfo.releaseInfo.appName,
            OriginalFilename: appInfo.releaseInfo.appName + '.exe',
            FileVersion: appInfo.electronVersion,
            ProductVersion: appInfo.version,
            ProductName: appInfo.releaseInfo.appName,
            InternalName: appInfo.name,
          },
        }
      },
      linbuild: {
        options: {
          name: appInfo.name,
          dir: './',
          out: 'build/dist',
          icon: 'build/resources/app.png',
          ignore: buildIgnore,
          version: appInfo.electronVersion,
          platform: 'linux',
          arch: 'x64,ia32',
          'app-version': appInfo.version,
          overwrite: true,
          prune: true
        }
      },
    },
    appdmg: {
      options: {
        basepath: 'build/dist/' + appInfo.name + '-darwin-x64',
        title: 'Install ' + appInfo.releaseInfo.appName,
        icon: '../../resources/mac/app.icns',
        background: '../../resources/mac/dmg_back.png',
        'icon-size': 80,
        contents: [
          {x: 448, y: 344, type: 'link', path: '/Applications'},
          {x: 192, y: 344, type: 'file', path: appInfo.releaseInfo.appName +'.app'}
        ]
      },
      target: {
        dest:
          'build/dist/' +
           appInfo.releaseInfo.appName +
           '_Mac_v' + appInfo.version + '.dmg'
      }
    },
    'create-windows-installer': {
      64: {
        iconUrl: fileURL('build/resources/win32/app.ico'),
        appDirectory: 'build/dist/' + appInfo.releaseInfo.appName + '-win32-x64',
        outputDirectory: 'build/dist/winstall64/',
        loadingGif: 'build/resources/win32/install_anim.gif',
        version: numericVersion,
        authors: appInfo.releaseInfo.company,
      },
      32: {
        iconUrl: fileURL('build/resources/win32/app.ico'),
        appDirectory: 'build/dist/' + appInfo.releaseInfo.appName + '-win32-ia32',
        outputDirectory: 'build/dist/winstall32/',
        loadingGif: 'build/resources/win32/install_anim.gif',
        version: numericVersion,
        authors: appInfo.releaseInfo.company,
      },
    },
    'electron-installer-debian': {
      options: {
        name: appInfo.name,
        productName: appInfo.releaseInfo.appName,
        description: appInfo.description,
        productDescription: appInfo.releaseInfo.description,
        genericName: 'Robot Controller',
        section: 'graphics',
        priority: 'optional',
        version: numericVersion,
        revision: appInfo.version.split('-')[1],
        categories: appInfo.releaseInfo.categories,
        lintianOverrides: [
          'changelog-file-missing-in-native-package',
          'executable-not-elf-or-script',
          'extra-license-file'
        ]
      },

      linux64: {
        options: {
          arch: 'amd64'
        },
        src: 'build/dist/' + appInfo.name + '-linux-x64',
        dest: 'build/dist/'
      }
    }
  });

  // Default task(s).
  grunt.registerTask('default', ['pre-build']);
};
