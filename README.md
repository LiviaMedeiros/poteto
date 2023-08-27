[![GPLv3 License](https://img.shields.io/github/license/LiviaMedeiros/poteto)](https://github.com/LiviaMedeiros/poteto/blob/HEAD/LICENSE)
[![npm](https://img.shields.io/npm/v/poteto.svg)](https://npmjs.com/package/poteto)
![npm bundle size](https://img.shields.io/bundlephobia/min/poteto)
[![CI](https://github.com/LiviaMedeiros/poteto/actions/workflows/github-ci.yml/badge.svg)](https://github.com/LiviaMedeiros/poteto/actions/workflows/github-ci.yml)
[![lint](https://github.com/LiviaMedeiros/poteto/actions/workflows/github-lint.yml/badge.svg)](https://github.com/LiviaMedeiros/poteto/actions/workflows/github-lint.yml)

# poteto

`poteto` allows `fetch` to work with local files over non-standartized `file:` protocol.

It can work as `fetch` polyfill (setting [`Proxy`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) over [`globalThis.fetch`](https://developer.mozilla.org/en-US/docs/Web/API/fetch) and [`globalThis.Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request)) or as ponyfill (providing a separate drop-in replacements for them).

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

// read file ranges and validate result using SRI
{
  const text = await poteto('./node_modules/poteto/LICENSE', {
    headers: {
      'Range': 'bytes=34264-34266,17303-17304,19991-19991',
    },
    integrity: 'sha512-pmndJoYi4kwRRbKcFCVXRnwT0nF/4d73zYKnqredfUIhfKddjRqL3Zbi+CjjkyMIX2e2HQEkV89kZeWdhj1MJQ==',
  }).then(r => r.text());
}

// write files with PUT
{
  const { status } = await poteto('file:./new_file.txt', {
    method: 'PUT',
    body: 'new ifel contents',
  });
}

// write partial file range with POST
{
  const { statusText } = await poteto('new_file.txt', {
    method: 'POST',
    body: 'fileUNUSED',
    headers: {
      'Range': 'bytes=4-7',
    },
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

// get symlink destination using manual redirect
{
  const { headers } = await poteto('/etc/mtab', { redirect: 'manual' });
  const location = headers.get('Location');
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

# Methods

## HTTP-alike methods

### `GET`

Reads file. Supports [`Range`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Range) header and SRI[^SRI].

Returns `HTTP 200` or `HTTP 206`, and file body.

### `HEAD`

Returns [`fs.Stats`](https://nodejs.org/api/fs.html#class-fsstats) of file in headers. Note that `GET` also does it.

Returns `HTTP 200` without body.

### `DELETE`

Deletes file or directory.

Returns `HTTP 204`.

### `POST` and `PUT`

Writes request body to file. Supports [`Range`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Range) header (only one range is allowed).

`POST` opens file with `r+` flag while `PUT` uses `w+`. Which means:
- `POST` can write partial file range in existing file without rewriting, but `PUT` will truncate the end and fill beginning with NUL bytes.
- `PUT` will create new files or overwrite existing ones, but `POST` will return `HTTP 404` if the file doesn't exist yet.

Returns `HTTP 201`.

## POTETO methods

These are case-sensitive.

### `APPEND`

Appends request body to file.

Returns `HTTP 201`.

### `LIST`

Reads directory contents. Also gets [`fs.Stats`](https://nodejs.org/api/fs.html#class-fsstats) for the directory.

Returns `HTTP 200` with JSON response, containing array of items. Subdirectory names will have trailing `/`.

### `READ`

Reads file. See [Why there is `GET` and `READ`](#why-there-is-put-and-write).

Returns `HTTP 200` and file body.

### `WRITE`

Writes request body to file in `w` mode. See [Why there is `PUT` and `WRITE`](#why-there-is-put-and-write) or ignore.

Returns `HTTP 201`.

# Response headers

Poteto-specific headers are be prefixed with `X-Poteto-` prefix. For example, to get filesize, look for `X-Poteto-Size` header.

# Error handling

If there is an error and it's known, returned promise is resolved with `Response` having reasonable HTTP status. For example, `ENOENT` translates to `HTTP 404` and `EACCES` translates to `HTTP 403`.

The headers contain error information. If `Accept` header is `application/json`, the body will contain serialized error as JSON; otherwise, it will contain its `.message`.

If the error is unknown, returned promise is rejected with it.

# Redirect handling

If `request.redirect === 'follow'` (default), symlinks will be quietly resolved.

If `request.redirect === 'error'`, returned promise will be rejected with `TypeError`.

If `request.redirect === 'manual'`, returned promise will be resolved with `HTTP 302` response with target URL in `Location` header.

# Subpaths

Subpath imports allow to add `poteto` to the project in different ways.

## `poteto/polyfill`

```mjs
import 'poteto/polyfill';

await fetch('/dev/null');
(new Request('/dev/null')).url === 'file:///dev/null'
```
Replaces `globalThis.fetch` and `globalThis.Request` with proxies.
Constructing `Request` with applicable URL results in regular `Request` instance but with fully-resolved `file:` URL.
For non-`file:` URLs, it works transparently.

## `poteto/ponyfill`

```mjs
import ponyfill from 'poteto/ponyfill';
import { fetch as potetoFetch, Request as PotetoRequest } from 'poteto/ponyfill';

ponyfill === potetoFetch;
```

Provides separate AsyncFunction `fetch` and Class `Request` that use `globalThis.fetch` and `globalThis.Request` internally but do not allow to indirectly mutate them.

## `poteto/factory`

```mjs
import { proxify, wrap } from 'poteto/factory';

const mutableFetch = proxify(fetch);
const independentFetch = wrap(fetch);
```

`proxify` allows to make poteto-like proxy around user-specified `fetch` function. This will use proxified `Request` internally.
`wrap` returns a new function that will use user-specified `fetch` function as fallback for non-`file:` URLs. This will use `PotetoRequest` class that extends `Request`.

## `poteto/internal`

```mjs
import { methods, execute } from 'poteto/internal';

methods.set('HELLO', async (url, request) => new Response('WORLD'));

await execute(new Request('file:///dev/zero', { method: 'HELLO' }));
```

Exposes internal Map `methods` and AsyncFunction `execute`.

`methods` has methods in a form of functions that take the `URL` instance as first argument and `Request` instance as second. This was made for convenience, because `request.url` exposes string instead of `URL` instance.

`execute(request[, url])` performs fetch using the methods map. Unlike in other imports, this one does not fallback for non-`file:` URL and executes request anyway. Optional `url` parameter allows to override first argument passing to the method.

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

However, some projections such as `GET` => `read file`, `ENOENT` => `404 Not Found`, `Accept: application/json` => `return data as json` are intuitive enough to be implemented, so here we are.

# CLI tools

There are a few things in `/bin/` that work as minimalistic examples.

## `poteto-cat fileurl1[, fileurl2[, ...]]`

Works as [`cat(1)`](https://man7.org/linux/man-pages/man1/cat.1.html): reads files in order, concatenates and prints on the stdout.

Uses `GET` method (hence, can be used with `https:` URLs as is).

## `poteto-dog fileurl1[, fileurl2[, ...]]`

Like `poteto-cat`, but insane: reads everything in async, and prints chunks on the stdout as fast as it can. If there are multiple files, depending on I/O, they may partially diffuse.

Uses `READ` method (depending on web server, can be used with `https:` URLs, but not recommended).

## `poteto-ls [dirurl1[, dirurl2[, ...]]]`

Works like recursive [`ls(1)`](https://man7.org/linux/man-pages/man1/ls.1.html): reads directories recursively, and outputs as pretty-printed JSON.

<details>
<summary>Example output</summary>

```json
// poteto-ls lib testdir
{
 "lib/": [
  "constants.mjs",
  "fs.mjs",
  "generic.mjs",
  "http.mjs",
  "methods.mjs",
  "poteto.mjs",
  "request.mjs",
  "sri.mjs"
 ],
 "testdir/": [
  ".keep",
  {
   "bin/": [
    ".keep"
   ]
  },
  {
   "redirect/": [
    ".keep",
    "link1",
    "link2",
    "target"
   ]
  },
  {
   "sequence/": [
    ".keep"
   ]
  }
 ]
}
```

</details>

Uses `LIST` method, don't use on `https:` URLs.

## `poteto-put fileurl`

Reads data from stdin and prints to file. Overwrites existing files, can create new files, can read from interactive (keyboard) input.

Uses `PUT` method, can be used with `https:` URL.

## `poteto-rm fileurl1[, fileurl2[, ...]]`

Works like [`rm()`](https://man7.org/linux/man-pages/man1/rm.1.html): deletes files. Not recursive, not interactive.

Uses `DELETE` method, can be used with `https:` URLs.

# FAQ

## Why there is `GET` and `READ`

`GET` loads the whole file in memory before responding. This might be significantly faster, but also means that getting 1Gb file will require >1Gb of memory to be used, no matter what.

Also `GET` supports `Range` header and SRI[^SRI], and might support other features that require checking file body (e.g. magic to determine `Content-Type`).

`READ` is stream-based. If the file body might not be consumed, or consumed partially, or consumed chunk-by-chunk, it will not allocate unnecessarily big amounts of memory.

~~Also `READ` leaks filehandles.~~

[^SRI]: [Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity)

## Why there is `PUT` and `WRITE`

Just to mirror `GET` and `READ`. They are different in the same way, but there shouldn't be any benefits in using `WRITE`.

Also `PUT` supports `Range` header which allows it to write in user-defined file positions.

## Why is it called like that

No particular reason.

## Can this be used in production

Why not, but be aware that there is no standard at the moment.

# License

[GPL-3.0-or-later](https://github.com/LiviaMedeiros/poteto/blob/HEAD/LICENSE)
