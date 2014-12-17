'use strict';

module.exports = function (grunt) {

  var path = require('path');

  if (grunt.option('time')) {
    require('time-grunt')(grunt);
  }

  require('load-grunt-config')(grunt, {
    configPath: path.join(__dirname, 'grunt'),
    data: {
      pkg: grunt.file.readJSON(path.join(__dirname, 'package.json'))
    }
  });

};
