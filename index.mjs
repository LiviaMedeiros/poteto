import fs from 'node:fs/promises';
import { Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';

import {
  errAsStatus,
  genericResponse,
  getGenericHeaders,
  getRanges,
} from './lib/http.mjs';
import {
  STAT_OPTS,
  READDIR_OPTS,
} from './lib/constants.mjs';
import {
  errorAsUndefined,
  getCwdURL,
  responseConstructor,
} from './lib/generic.mjs';
import {
  validatedBody,
} from './lib/sri.mjs';
import {
  readRange,
  writeRange,
} from './lib/fs.mjs';

const _params = Object.fromEntries(new URL(import.meta.url).searchParams.entries());
const cwdURL = _params.persistCwd
  ? getCwdURL()
  : { [Symbol.toPrimitive]: getCwdURL };
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
  ].filter(([, $]) => $ !== undefined));

const statsAsOptions = async (statsOrError, { status } = {}) =>
  Promise.resolve(statsOrError)
    .catch($ => $)
    .then(headers => ({ ...errAsStatus(headers, status), headers }))
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

const GET = async (url, { headers, integrity, signal }) => {
  const stats = await fs.stat(url, STAT_OPTS);
  const { size } = stats;

  const ranges = getRanges(headers);

  return ranges.length
    ? Promise.all(ranges.map(range => readRange(range, size, url)))
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
};

const HEAD = async url =>
  statsAsOptions(fs.stat(url, STAT_OPTS)).then($ => new Response(null, $));

const PUT = async (url, { body, headers, signal }) => {
  const [range] = getRanges(headers);

  return range
    ? writeRange(range, url, body)
    : fs.writeFile(url, body, { signal });
};

const DELETE = async url =>
  fs.rm(url).then(() => genericResponse(204));

const methods = new Map([
  // HTTP-alike methods
  ['GET', GET],
  ['HEAD', HEAD],
  ['PUT', async (url, { body, headers, signal }) =>
    body
      ? PUT(url, { body, headers, signal }).then(() => genericResponse(201))
      : genericResponse(422)],
  ['DELETE', DELETE],

  // POTETO methods
  ['READ', async url =>
    fs.open(url).then(async fd =>
      new Response(
        // fd must be closed someow after the stream is consumed
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

const handler = {
  async apply(target, thisArg, argumentsList) {
    const { url, request } = fileRequestURL(argumentsList);

    return url.protocol === 'file:'
      ? executeRequest(url, request).catch(err =>
        statsAsOptions(err).then(opts =>
          opts.status
            ? Promise.resolve(/application\/json/.test(request.headers.get('Accept'))
              ? Response.json(err, opts)
              : new Response(err.message, opts))
            : Promise.reject(err)
        ))
      : Reflect.apply(target, thisArg, argumentsList);
  },
};

export default new Proxy(fetch, handler);
