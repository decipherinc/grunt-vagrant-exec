# grunt-vagrant-exec

Execute commands on Vagrant machine via Grunt.

***WIP!***

## Rationale

The other Grunt plugins to do this sort of thing didn't work well for me.

## Features:

- Multitask
- Supports multiple commands
- Supports a current working directory in which to run command(s)
- Will read SSH config from output of `vagrant ssh-config` by default
- Supports custom user, host, port, password, and keyfile settings

## Example

```js
{
  vagrant: {
    options: {
      command: ['make clean', 'make'],
      cwd: '/vagrant'
    },
    target1: {
      user: 'foo',
      host: 'bar',
      password: 'Password1' // don't do this.
    },
    target2: {
      port: 2222,
      key: '/path/to/keyfile'
    },
    target3: {} // use ssh-config settings entirely
  }
}
```

## Author

[Christopher Hiller](http://decipherinc.com)

## Copyright

Copyright &copy; 2014 Decipher, Inc.

## License

MIT
