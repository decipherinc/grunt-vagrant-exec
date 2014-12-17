/**
 * @module grunt-vagrant-exec
 * @author Christopher Hiller <chiller@decipherinc.com>
 * @copyright Copyright (c) 2014, Decipher, Inc.
 * @license MIT
 */

'use strict';

module.exports = function (grunt) {

  var format = require('util').format,
    path = require('path'),

    Q = require('q'),
    exec = require('child-process-promise').exec,
    defaults = require('defaults'),
    SSH = require('simple-ssh'),
    parse = require('ssh-config-parser'),

    pkg = require(path.join(__dirname, '..', 'package.json')),

    /**
     * Processes `command` property as supplied by the user.
     * @param {Object} data Data object
     * @param {Object} data.options Task options
     * @returns {Promise}
     */
    processCommands = function processCommands(data) {

      return Q(function () {
        var options = data.options,
          commands = Array.prototype.concat(options.command);

        if (!commands.length) {
          return Q.reject({
            msg: 'Non-empty "command" property required'
          });
        }

        // wrap the command(s)s to fake actual "cwd" support.
        // coerces `command` into an array.
        commands = commands.map(function (cmd) {
          return format('cd %s; %s; cd - >/dev/null', options.cwd, cmd);
        });

        /**
         * Formats command array for printing.
         * @returns {string}
         */
        commands.toString = function toString() {
          return this.join('\n\t');
        };

        grunt.verbose.ok('Parsed command(s)');

        data.commands = commands;

        return data;

      }(data));
    },

    parseKey = function parseKey(options) {
      var key;
      return Q(function (options) {
        if (options.key) {
          try {
            key = grunt.file.read(options.key)
            grunt.verbose.ok(format('Read identity file "%s"', options.key));
          } catch (err) {
            return Q.reject({
              msg: format('Could not read specified identity file "%s"',
                options.key),
              err: err
            });
          }
        }
      }(options));
    },

    parseOptions = function parseOptions(options) {

      // default cwd to vagrant dir
      // TODO: parse cwd from Vagrantfile
      defaults(options, {
        cwd: '/vagrant',
        host: '127.0.0.1',
        user: 'vagrant',
        port: 2222
      });

      if (options.key) {
        options.key = parseKey(options);
      }

      return Q({
        options: options
      });
    },

    parseSshOptions = function parseSshOptions(data) {

      var options = data.options,
        config = data.config,
        sshOpts = {
          host: options.host || config.host,
          user: options.user || config.User,
          port: options.port || config.Port
        };

      // if pw is specified, do not use key.
      if (options.password) {
        sshOpts.password = options.password;
      } else {
        sshOpts.key = key;
      }

      grunt.verbose.ok(format('Using SSH options: \n%s',
        JSON.stringify(sshOpts, null, 2)));

      data.sshOpts = sshOpts;

      return Q(data);
    },

    execSsh = function execSsh(data) {
      var sshOpts = data.sshOpts,
        commands = data.commands,
        dfrd = Q.defer(),
        ssh = new SSH(sshOpts),
        execOpts = {
          out: grunt.log.writeln.bind(grunt.log)
        };

      commands.forEach(function (cmd) {
        ssh.exec(cmd, execOpts);
        grunt.verbose.ok(format('Queued command "%s"', cmd));
      });

      ssh.on('exit', function (code) {
        if (code) {
          dfrd.reject({
            msg: format('Returned code %d', code)
          });
        }
        dfrd.resolve(format('Executed command(s) successfully: \n%s',
          commands));
      })
        .on('error', function (err) {
          dfrd.reject({
            msg: 'Error executing command',
            err: err
          });
        })
        .start({
          fail: function (err) {
            dfrd.reject({
              msg: format('Failed to connect to %s:%s', ssh.host, ssh.port),
              err: err
            });
          },
          success: function () {
            grunt.log.verbose.ok(format('Connected successfully to %s:%s',
              ssh.host, ssh.port));
          }
        });

      return dfrd.promise;
    },

    parseVagrantSshConfig = function parseVagrantSshConfig(data) {

      var options = data.options;

      return exec('vagrant ssh-config')
        .then(function (result) {
          var stdout = result.stdout,
            config,
            idFile;
          grunt.verbose.ok('Received Vagrant ssh config');

          try {
            config = parse(stdout)[0];
          } catch (err) {
            return Q.reject({
              msg: format('Failed to parse Vagrant ssh config output: %s',
                stdout),
              err: err
            });
          }
          grunt.verbose.ok('Parsed Vagrant ssh config');

          idFile = config.IdentityFile;
          if (!options.key && config.IdentityFile) {
            try {
              options.key = grunt.file.read(idFile);
            } catch (err) {
              return Q.reject({
                msg: format('Failed to read identity file specified by Vagrant ssh config: %s',
                  idFile),
                err: err
              });
            }
            grunt.verbose.ok(format('Read identity file "%s"', idFile));
          }
          data.config = config;
          return data;
        }, function () {
          grunt.log.verbose.error('Could not read Vagrant ssh config');
          data.config = {};
          return data;
        })
    };

  grunt.registerMultiTask('vagrant', pkg.description, function vagrant() {
    var done = this.async(),
      options = this.options,
      target = this.target,
      commands;

    parseOptions(options)
      .then(processCommands)
      .then(parseVagrantSshConfig)
      .then(parseSshOptions)
      .then(execSsh)
      .catch(function (err) {
        grunt.log.error(err.msg);
        grunt.warn(err.err);
      })
      .finally(done);
  });
};
