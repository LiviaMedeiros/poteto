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
import {
  errorAsUndefined,
  requestConstructor,
  responseConstructor,
} from './lib/generic.mjs';
import {
  validatedBody,
} from './lib/sri.mjs';

const _params = Object.fromEntries(new URL(import.meta.url).searchParams.entries());
const cwdURL = _params.persistCwd
  ? pathToFileURL(cwd() + sep).href
  : { [Symbol.toPrimitive]: () => pathToFileURL(cwd() + sep).href };
const PREFIX = `X-${_params.prefix ?? 'POTETO'}-`;

const adjustHeaders = ({ headers }) =>
  new Headers([
    ...getGenericHeaders(),
    ...Object.entries(headers).map(([$, _]) => [
      `${PREFIX}${$}`,
      _ instanceof Date ? _.toISOString() : `${_}`,
    ]),

    // TODO: Etag?
    // TODO: Content-Type?
    ['Content-Length', headers.size],
    ['Last-Modified', headers.mtime?.toUTCString()],
  ].filter(([$, _]) => _ !== undefined));

const statsAsOptions = async (statsOrError, { status } = {}) =>
  Promise.resolve(statsOrError)
    .then(
      headers => ({ ...errAsStatus(headers, status), headers }),
      headers => ({ ...errAsStatus(headers, status), headers })
    )
    .then($ => Object.assign($, { headers: adjustHeaders($) }));

const getFileURL = (url, fileURL = null) =>
  (fileURL = new URL(url, cwdURL)).protocol === 'file:'
    ? fileURL
    : url;

const fileRequestURL = ([ resource, options ], url, request) => (
  resource instanceof Request
    ? url = new URL((request = new Request(getFileURL(resource.url), options)).url)
    : request = new Request(url = getFileURL(resource), options),
  { request, url });

const blockingHooks = [
  // if request.redirect is not follow,
  async (url, { redirect }) => {
    if (redirect === 'follow')
      return;
    const target = await fs.readlink(url).then(pathToFileURL, errorAsUndefined);
    if (!target)
      return;
    if (redirect === 'error')
      throw new TypeError(`Got symlink: ${url} -> ${target}`);
    // redirect === 'manual'
    return genericResponse(302, { headers: { 'Location': target } });
  },
];

const preHooks = async (url, request) => {
  for (const hook of blockingHooks) {
    const response = await hook(url, request);
    if (response)
      return response;
  }
};

const methods = new Map([
  // HTTP-alike methods
  ['GET', async (url, { headers, integrity, signal }) => {
    const stats = await fs.stat(url, STAT_OPTS);
    const { size } = stats;

    const ranges = headers.get('Range')?.split(';')[0].split('=')[1].split(',').map($ => $.trim());

    return ranges
      ? Promise.all(
          ranges.map(
            async $ => {
              let [start, end] = $.split('-').map($ => $ === '' ? null : BigInt($));
              end ??= size - 1n;
              start ?? (start = size - end, end = size - 1n);

              if (end > size - 1n)
                throw new RangeError(`end (${end}) exceeds size (${size}) - 1`);
              if (start < 0n)
                throw new RangeError(`start (${start}) less than 0`);
              if (start > end)
                throw new RangeError(`start (${start}) more than end (${end})`);

              const length = Number(end - start + 1n);
              const position = Number(start);

              let fd;
              try {
                fd = await fs.open(url);
                return fd.read(new Uint8Array(length), {
                  length,
                  position,
                }).then(({ buffer }) => buffer);
              } finally {
                await fd?.[Symbol.asyncDispose]();
              }
            }
          )
        )
          .then($ => validatedBody(integrity, $))
          .then(
            async body => [
              body,
              await statsAsOptions(
                Object.assign(stats, { size: BigInt(body.byteLength) }),
                { status: 206 }
              ),
            ]
          )
          .then(responseConstructor)
          .catch($ => $ instanceof RangeError
            ? genericResponse(416)
            : Promise.reject($)
          )
      : Promise.all([
          fs.readFile(url, { signal }).then($ => validatedBody(integrity, [$])),
          statsAsOptions(stats),
        ]).then(responseConstructor);
  }],
  ['HEAD', async url =>
    statsAsOptions(fs.stat(url, STAT_OPTS)).then($ => new Response(null, $))],
  ['PUT', async (url, { body, signal }) =>
    body
      ? fs.writeFile(url, body, { signal }).then(() => genericResponse(201))
      : genericResponse(422)],
  ['DELETE', async url =>
    fs.rm(url).then(() => genericResponse(204))],

  // POTETO methods
  ['READ', async (url, { signal }) =>
    fs.open(url).then(async fd =>
      new Response(
        // this should close fd... somehow
        fd.readableWebStream({ type: 'bytes' }),
        //Readable.toWeb(fd.createReadStream({ signal })),
        await statsAsOptions(fd.stat(STAT_OPTS))
      )
    )],
  ['WRITE', async (url, { body, signal }) =>
    body instanceof ReadableStream
      ? fs.open(url, 'w')
          .then(fd => body.pipeTo(Writable.toWeb(fd.createWriteStream()), { signal }))
          .then(() => genericResponse(201))
      : genericResponse(422)],
  ['APPEND', async (url, { body, signal }) =>
    body
      ? fs.appendFile(url, body, { signal }).then(() => genericResponse(201))
      : genericResponse(422)],
  ['LIST', async url =>
    fs.readdir(url, READDIR_OPTS).then(async $ =>
      Response.json(
        $.map($ => `${$.name}${$.isDirectory() ? '/' : ''}`),
        await statsAsOptions(fs.stat(url, STAT_OPTS))
      )
    )],

  // unsupported HTTP-alike methods
  ['POST', async () => genericResponse(501)],
  ['CONNECT', async () => genericResponse(501)],
  ['OPTIONS', async () => genericResponse(501)],
  ['TRACE', async () => genericResponse(501)],
]);

const executeRequest = async (url, request) =>
  await preHooks(url, request) ??
  (methods.get(request.method) ??
  (async () => genericResponse(405)))(url, request);

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
