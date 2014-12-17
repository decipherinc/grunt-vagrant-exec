/**
 * @module grunt-vagrant-exec
 * @author Christopher Hiller <chiller@decipherinc.com>
 * @copyright Copyright (c) 2014, Decipher, Inc.
 * @license MIT
 */

'use strict';

module.exports = function (grunt) {

  var execute = require('../lib')(grunt).execute,
    pkg = grunt.file.readJSON(path.join(__dirname, '..', 'package.json'));

  grunt.registerMultiTask('vagrant', pkg.description, function vagrant() {
    var done = this.async(),
      options = this.options;

    execute(options)
      .finally(done);

  });
};
