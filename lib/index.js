/**
 * @module lib
 * @todo Decouple from Grunt.
 */

/**
 * Data object passed to, and from, most promise-returning functions
 * @typedef {Object} Data
 * @property {Options} options User-specified task options
 * @property {Object} config SSH config, as read from `vagrant-ssh-config`
 * @property {Object} sshOpts SSH-specific options, distilled from `options`
 *   and `config`
 * @property {Array<String>} commands Array of commands
 */

/**
 * Task Options
 * @typedef {Object} Options
 * @property {string} [cwd=/vagrant] Current working directory on Vagrant
 *   machine
 * @property {string} [user=vagrant] Username for Vagrant machine
 * @property {string} [host=127.0.0.1] Host for Vagrant machine
 * @property {number} [port=2222] Port for Vagrant machine
 * @property {string} [password] Password to use for Vagrant user.  Don't use
 *   this.
 * @property {string} [keyfile] Path to alternate identity file
 */

'use strict';

var format = require('util').format,
  path = require('path'),

  Q = require('q'),
  exec = require('child-process-promise').exec,
  defaults = require('defaults'),
  SSH = require('simple-ssh'),
  parse = require('ssh-config-parser'),

  /**
   * These are the default options for a task
   * @type {{user: string, host: string, port: number, cwd: string}}
   */
  defaultOptions = {
    user: 'vagrant',
    host: '127.0.0.1',
    port: 2222,
    cwd: '/vagrant'
  };

/**
 * Returns an object full of methods that make `grunt-vagrant-exec` work.
 * @param {Object} grunt Grunt instance, or object, or something.
 * @returns {{processCommands: Function, _readKey: Function, parseOptions:
 *   Function, parseSSHOptions: Function, execSSH: Function,
 *   parseVagrantSSHConfig: Function, execute: Function}}
 */
module.exports = function (grunt) {

  var log = grunt.log,
    verbose = grunt.verbose,
    warn = grunt.warn,

    vagrant = {

      /**
       * Processes `command` property as supplied by the user.
       * @param {Data} data Data object
       * @returns {Promise}
       */
      processCommands: function processCommands(data) {

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

          verbose.ok('Parsed command(s)');

          data.commands = commands;

          return data;

        }(data));
      },

      /**
       * Reads SSH key from identity file.
       * @param {string} keyfile Filepath to custom identity file
       * @returns {(string|undefined)}
       */
      _readKey: function _readKey(keyfile) {
        var key;
        if (keyfile) {
          try {
            key = grunt.file.read(keyfile);
            verbose.ok(format('Read identity file "%s"', keyfile));
            return key;
          } catch (err) {
            log.error(format('Could not read specified identity file "%s"',
              keyfile));
            throw err;
          }
        }
      },

      /**
       * Parses task options and sets defaults.
       * @param {Options} options Options object
       * @returns {Promise}
       */
      parseOptions: function parseOptions(options) {

        // default cwd to vagrant dir
        // TODO: parse cwd from Vagrantfile
        defaults(options, defaultOptions);

        options.key = this._readKey(options.keyfile);

        return Q({
          options: options
        });
      },

      /**
       * Distills user options into options for SSH
       * @param {Data} data Data object
       * @returns {Promise}
       */
      parseSSHOptions: function parseSSHOptions(data) {

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
          sshOpts.key = options.key;
        }

        verbose.ok(format('Using SSH options: \n%s',
          JSON.stringify(sshOpts, null, 2)));

        data.sshOpts = sshOpts;

        return Q(data);
      },

      /**
       * Executes command(s) over SSH tunnel into Vagrant machine
       * @param {Data} data Data object
       * @returns {Promise}
       */
      execSSH: function execSSH(data) {
        var sshOpts = data.sshOpts,
          commands = data.commands,
          dfrd = Q.defer(),
          ssh = new SSH(sshOpts),
          execOpts = {
            out: log.writeln.bind(log)
          };

        commands.forEach(function (cmd) {
          ssh.exec(cmd, execOpts);
          verbose.ok(format('Queued command "%s"', cmd));
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
              verbose.ok(format('Connected successfully to %s:%s',
                ssh.host, ssh.port));
            }
          });

        return dfrd.promise;
      },

      /**
       * Reads and parses result of `vagrant ssh-config`
       * @param {Data} data Data object
       * @returns {Promise}
       */
      parseVagrantSSHConfig: function parseVagrantSSHConfig(data) {

        var options = data.options;

        return exec('vagrant ssh-config')
          .then(function (result) {
            var stdout = result.stdout,
              config,
              idFile;
            verbose.ok('Received Vagrant ssh config');

            try {
              config = parse(stdout)[0];
            } catch (err) {
              return Q.reject({
                msg: format('Failed to parse Vagrant ssh config output: %s',
                  stdout),
                err: err
              });
            }
            verbose.ok('Parsed Vagrant ssh config');

            idFile = config.IdentityFile;
            if (!options.key && config.IdentityFile) {
              try {
                options.key = grunt.file.read(idFile);
              } catch (err) {
                return Q.reject({
                  msg: format('Failed to read identity file specified by ' +
                  'Vagrant ssh config: %s', idFile),
                  err: err
                });
              }
              verbose.ok(format('Read identity file "%s"', idFile));
            }
            data.config = config;
            return data;
          }, function () {
            verbose.error('Could not read Vagrant ssh config');
            data.config = {};
            return data;
          });
      },

      /**
       * Executes command(s) over SSH into Vagrant box.
       * @param {Options} options
       * @returns {*}
       */
      execute: function execute(options) {

        return vagrant.parseOptions(options)
          .then(vagrant.processCommands)
          .then(vagrant.parseVagrantSSHConfig)
          .then(vagrant.parseSSHOptions)
          .then(vagrant.execSSH)
          .catch(function (err) {
            grunt.log.error(err.msg);
            warn(err.err);
          });
      }
    };

  return vagrant;

};

// expose for unit testing
module.exports._defaultOptions = defaultOptions;

