import fs from 'node:fs/promises';
import { sep } from 'node:path';
import { cwd } from 'node:process';
import { Readable, Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';

import {
  errAsStatus,
  genericResponse,
  getGenericHeaders,
} from './lib/http.mjs';
import {
  STAT_OPTS,
  READDIR_OPTS,
} from './lib/constants.mjs';

const _params = Object.fromEntries(new URL(import.meta.url).searchParams.entries());
const cwdURL = _params.persistCwd
  ? pathToFileURL(cwd() + sep).href
  : { [Symbol.toPrimitive]: () => pathToFileURL(cwd() + sep).href };
const PREFIX = `X-${_params.prefix ?? 'POTETO'}-`;

const requestConstructor = Reflect.construct.bind(Reflect, Request);
const responseConstructor = Reflect.construct.bind(Reflect, Response);

const adjustHeaders = ({ headers }) =>
  new Headers([
    ...getGenericHeaders(),
    ...Object.entries(headers).map(([$, _]) => [
      `${PREFIX}${$}`,
      _ instanceof Date ? _.toISOString() : `${_}`,
    ]),

    // TODO: Etag?
    // TODO: Content-Type?
    // TODO: Location for symlinks based on redirect option?
    ['Content-Length', headers.size],
    ['Last-Modified', headers.mtime?.toUTCString()],
  ].filter(([$, _]) => _ !== undefined));

const statsAsOptions = async statsOrError =>
  Promise.resolve(statsOrError)
    .then(
      headers => ({ ...errAsStatus(headers), headers }),
      headers => ({ ...errAsStatus(headers), headers })
    )
    .then($ => Object.assign($, { headers: adjustHeaders($) }));

const getFileURL = (url, fileURL = null) => {
  if (_params.persistCwd)
    fileURL = new URL(url, cwdURL);
  else 
    try {
      fileURL = new URL(url);
    } catch {
      fileURL = new URL(url, cwdURL);
    }

  return fileURL.protocol === 'file:' ? fileURL : url;
};

const fileRequestURL = ([ resource, options ], url, request) => (
  resource instanceof Request
    ? url = new URL((request = new Request(getFileURL(resource.url), options)).url)
    : request = new Request(url = getFileURL(resource), options),
  { request, url });

const methods = new Map([
  // HTTP-alike methods
  ['GET', (url, { signal }) =>
    Promise.all([
      fs.readFile(url, { signal }),
      statsAsOptions(fs.stat(url, STAT_OPTS))
    ]).then(responseConstructor)],
  ['HEAD', url =>
    statsAsOptions(fs.stat(url, STAT_OPTS)).then($ => new Response(null, $))],
  ['PUT', (url, { body, signal }) =>
    body
      ? fs.writeFile(url, body, { signal }).then(() => genericResponse(201))
      : genericResponse(422)],
  ['DELETE', url =>
    fs.rm(url).then(() => genericResponse(204))],

  // POTETO methods
  ['READ', (url, { signal }) =>
    fs.open(url).then(async fd =>
      new Response(
        // this should close fd... somehow
        fd.readableWebStream({ type: 'bytes' }),
        //Readable.toWeb(fd.createReadStream({ signal })),
        await statsAsOptions(fd.stat(STAT_OPTS))
      )
    )],
  ['WRITE', (url, { body, signal }) =>
    body instanceof ReadableStream
      ? fs.open(url, 'w')
          .then(fd => body.pipeTo(Writable.toWeb(fd.createWriteStream()), { signal }))
          .then(() => genericResponse(201))
      : genericResponse(422)],
  ['APPEND', (url, { body, signal }) =>
    body
      ? fs.appendFile(url, body, { signal }).then(() => genericResponse(201))
      : genericResponse(422)],
  ['LIST', url =>
    fs.readdir(url, READDIR_OPTS).then(async $ =>
      Response.json(
        $.map($ => `${$.name}${$.isDirectory() ? '/' : ''}`),
        await statsAsOptions(fs.stat(url, STAT_OPTS))
      )
    )],

  // unsupported HTTP-alike methods
  ['POST', () => genericResponse(501)],
  ['CONNECT', () => genericResponse(501)],
  ['OPTIONS', () => genericResponse(501)],
  ['TRACE', () => genericResponse(501)],
]);

const executeRequest = async (url, request) =>
  (methods.get(request.method) ?? (() => genericResponse(405)))(url, request);

export default new Proxy(fetch, {
  async apply(target, thisArg, argumentsList) {
    const { url, request } = fileRequestURL(argumentsList);

    return url.protocol === 'file:'
      ? executeRequest(url, request).catch(err =>
          statsAsOptions(err).then(opts => opts.status
            ? Promise.resolve(/application\/json/.test(request.headers.get('Accept'))
              ? Response.json(err, opts)
              : new Response(err.message, opts))
            : Promise.reject(err)
          ))
      : Reflect.apply(target, thisArg, argumentsList);
  }
});
