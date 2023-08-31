import fs from 'node:fs/promises';

import {
  genericResponse,
  getRanges,
  preHooks,
  statsAsOptions,
} from './http.mjs';
import {
  STAT_OPTS,
  READDIR_OPTS,
} from './constants.mjs';
import {
  responseConstructor,
} from './generic.mjs';
import {
  validatedBody,
} from './sri.mjs';
import {
  readRanges,
  writeRange,
} from './fs.mjs';

const DELETE = async url =>
  fs.rm(url).then(() => genericResponse(204));

const GET = async (url, { headers, integrity, signal }) => {
  const stats = await fs.stat(url, STAT_OPTS);
  const { size } = stats;

  const ranges = getRanges(headers);

  return ranges.length
    ? readRanges(url, ranges, size)
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

const POSTorPUT = async (url, { body, headers, method }) => {
  if (!body)
    return genericResponse(422);

  const flag = method === 'POST' ? 'r+' : 'w+';
  const [range] = getRanges(headers);
  return writeRange(url, range ?? '-', body, flag).then(() => genericResponse(201));
};

const methods = new Map([
  // HTTP-alike methods
  ['DELETE', DELETE],
  ['GET', GET],
  ['HEAD', HEAD],
  ['POST', POSTorPUT],
  ['PUT', POSTorPUT],

  // POTETO methods
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
  ['READ', async url =>
    fs.open(url).then(async fd =>
      new Response(
        // fd must be closed someow after the stream is consumed
        fd.readableWebStream({ type: 'bytes' }),
        //Readable.toWeb(fd.createReadStream({ signal })),
        await statsAsOptions(fd.stat(STAT_OPTS))
      )
    )],
  ['WRITE', POSTorPUT],

  // unsupported HTTP-alike methods
  ['CONNECT', async () => genericResponse(501)],

  // forbidden HTTP-alike methods that should throw
  ['OPTIONS', async () => genericResponse(501)],
  ['TRACE', async () => genericResponse(501)],
  ['TRACK', async () => genericResponse(501)],
]);

const executeRequest = async (url, request) =>
  await preHooks(url, request) ??
  (methods.get(request.method) ??
  (async () => genericResponse(405)))(url, request);

const execute = async (request, url = new URL(request.url)) =>
  executeRequest(url, request).catch(err =>
    statsAsOptions(err).then(opts =>
      opts.status
        ? Promise.resolve(/application\/json/.test(request.headers.get('Accept'))
          ? Response.json(err, opts)
          : new Response(err.message, opts))
        : Promise.reject(err)
    )
  );

export {
  methods,
  execute,
};
