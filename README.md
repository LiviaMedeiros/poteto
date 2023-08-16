[![npm](https://img.shields.io/npm/v/poteto.svg)](https://npmjs.com/package/poteto)

# poteto

`poteto` is a drop-in replacement for `fetch` (in fact, it's a `Proxy` over `globalThis.fetch`) that can work with local files over non-standartized `file:` protocol.

It can understand:

- `URL` instance having `.protocol === 'file:'`
- string or any other object with a stringifier, such as:
  - absolute URL having `file` protocol, e.g. `file:///usr/bin/node`
  - relative URL having `file` protocol, e.g. `file:file.ext`, `file:../subdir/file.ext` [^RelativeFileURL]
  - relative URL, including:
    - relative URL starting from directory or file name, e.g. `file.ext` or `subdir/file.ext`
    - relative URL starting from `.`, e.g. `./file.ext` or `../subdir/file.ext`
    - URL with absolute pathname starting from `/`, e.g. `/usr/bin/node`
    - schemeless URL starting from `///`, e.g. `///usr/bin/node`
    - empty string, which is equivalent to `file:` or `.`

...and work with them in somewhat HTTP-compatible manner.

Relative paths are resolved against CWD[^CWD].

URLs that are normally supported by standard `fetch` are fetched like usual.

[^RelativeFileURL]: Note that unary `URL` constructor in Node.js resolves these as absolute paths, i.e. `new URL('file:file.txt').href === new URL('file:./file.txt').href === new URL('file:../file.txt').href === 'file:///file.txt'`. But if `baseURL` is provided, it's interpreted as relative path.

[^CWD]: Current Working Directory

# Installation

```console
$ npm i poteto
```

# Usage

```mjs
import poteto from 'poteto';

// read files with GET
{
  const text = await poteto(import.meta.url).then(r => r.text());
  const json = await poteto('node_modules/poteto/package.json').then(r => r.json());
  const buffer = await poteto('/usr/bin/node').then(r => r.arrayBuffer());
}

// read files with READ in memory-efficient stream-based way
{
  const { body } = await poteto('/dev/urandom', { method: 'READ' });
}

// write files with PUT
{
  const { status } = await poteto('file:./new_file.txt', {
    method: 'PUT',
    body: 'new file contents',
  });
}

// write files with WRITE for no particular reason
{
  const potentialErrorMessage = await poteto('./new_file.txt', {
    method: 'WRITE',
    body: 'newer file contents',
  }).then(r => r.text());
}

// append to files with APPEND
{
  const { ok } = await poteto('oops/../new_file.txt', {
    method: 'APPEND',
    body: '\nbut wait, there is more\n',
  });
}

// list files and directories with LIST
{
  const filenames = await poteto('.', { method: 'LIST' }).then(r => r.json());
}

// get stats without reading the file with HEAD
// (GET, READ and LIST also return fs stats)
{
  const { headers } = await poteto('file:package.json', { method: 'HEAD' });
  const filesize = headers.get('Content-Length');
  const mtimeHTTPdate = headers.get('Last-Modified');
  const mtimeTemporal = new Temporal.Instant(headers.get('X-Poteto-MtimeNs'));
}

// get errors as JSON
{
  const errorInfo = await poteto('file:///non/existent/path', {
    method: 'PUT',
    body: 'some data',
    headers: {
      'Accept': 'application/json',
    },
  }).then(r => r.json());
}

// and do usual fetches transparently
{
  const response = await poteto('https://github.com/LiviaMedeiros/poteto', {
    headers: {
        'User-Agent': 'Poteto',
    },
  });
}
```

# Rationale

Sometimes we just want to be able to read local and remote files in the same manner.
Some other languages have similar capabilities, for example, `file_get_contents()` in PHP can read files over http(s).

Sometimes we want to avoid explicitly using `node:fs` for trivial reading operation.

Sometimes we want convenience methods such as `response.json()`

Sometimes we don't want to switch context of thinking between `node:fs` and Fetch API.

Sometimes we have urlstring pointing on file instead of pathstring or `URL` instance.

Sometimes we have relative URL rather than relative path.

Sometimes we want to read a file requested by URL and have appropriate HTTP `Response` to return.

# HTTP-alike `file:`

Right now `file` protocol is not standartized, and HTTP entities such as status codes, headers and algorithms are not related to it.

However, some projections such as `GET` => `read file`, `ENOENT` => `404 Not Found`, `Accept: application/json` => `return data as json` are intuitive enough to be implemented.

# Why there is `GET` and `READ`

`GET` loads the whole file in memory before responding. This might be significantly faster, but also means that getting 1Gb file will require >1Gb of memory to be used, no matter what.

`READ` is stream-based. If the file body might not be consumed, or consumed partially, or consumed chunk-by-chunk, it will not allocate unnecessarily big amounts of memory.

~~Also `READ` leaks filehandles.~~

# Why there is `PUT` and `WRITE`

Just to mirror `GET` and `READ`. They are different in the same way, but there shouldn't be any benefits in using `WRITE`.

# Why is it called like that

No particular reason.

# License

[GPL-3.0-or-later](https://github.com/LiviaMedeiros/poteto/blob/HEAD/LICENSE)
