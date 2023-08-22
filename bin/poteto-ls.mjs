#!/usr/bin/env node
import poteto from '../index.mjs?persistCwd=true';

const printResponse = $ =>
  process.stdout.write(JSON.stringify(Object.fromEntries($), null, 1));

const [,, ...urls] = process.argv;

const ls = async (_ = '.') =>
  poteto(`${_}`, { method: 'LIST' }).then($ =>
    $.ok
      ? $.json().then($ =>
        Promise.all($.map(async $ =>
          $.endsWith('/')
            ? { [$]: await ls(_ + $) }
            : $
        )))
      : $.status
  );

// reads directory recursively and returns recursive object:
// key represents directory name with trailing slash, value is array of
// strings for filenames and same objects for directories;
// in case of error, the value is integer representing status code
await Promise.all((urls.length ? [...new Set(urls)] : ['.']).map(_ =>
  ls(_ += '/').then($ => [_, $])
)).then(printResponse);
