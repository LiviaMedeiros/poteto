import { readlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const _params = Object.fromEntries(new URL(import.meta.url).searchParams.entries());
const PREFIX = `X-${_params.prefix ?? 'Poteto'}-`;

const errorAsUndefined = () => {};

const HEADERS_ALLOW = Object.freeze(new Headers({
  Allow: [
    'GET',
    'HEAD',
    'PUT',
    'DELETE',
    'READ',
    'WRITE',
    'APPEND',
    'LIST',
  ].join(', ')
}));

const httpErrs = new Map([
  ['ERR_INVALID_ARG_TYPE', 400],
  ['ERR_INVALID_ARG_VALUE', 400],
  ['EISDIR', 400],
  ['ENOTDIR', 400],
  ['ENAMETOOLONG', 400],
  ['EACCES', 403],
  ['ENOENT', 404],
  ['EIO', 500],
  ['ENOMEM', 500],
  ['EBUSY', 503],
]);

const httpOpts = new Map([
  [200, { status: 200, statusText: 'OK' }],
  [201, { status: 201, statusText: 'Created' }],
  [204, { status: 204, statusText: 'No Content' }],
  [206, { status: 206, statusText: 'Partial Content' }],
  [302, { status: 302, statusText: 'Found' }],
  [304, { status: 304, statusText: 'Not Modified' }],
  [400, { status: 400, statusText: 'Bad Request' }],
  [403, { status: 403, statusText: 'Forbidden' }],
  [404, { status: 404, statusText: 'Not Found' }],
  [405, { status: 405, statusText: 'Method Not Allowed', headers: HEADERS_ALLOW }],
  [412, { status: 412, statusText: 'Precondition Failed' }],
  [416, { status: 416, statusText: 'Range Not Satisfiable' }],
  [422, { status: 422, statusText: 'Unprocessable Content' }],
  [500, { status: 500, statusText: 'Internal Server Error' }],
  [501, { status: 501, statusText: 'Not Implemented', headers: HEADERS_ALLOW }],
  [503, { status: 503, statusText: 'Service Unavailable' }],
]);

const errAsStatus = (err, status = 200) =>
  httpOpts.get(err instanceof Error
    ? httpErrs.get(err.code)
    : status
  );

const stringifyHeader = ([$, _]) => [
  $,
  typeof _ === 'string'
    ? _
    : typeof _ === 'function' // this should never happen unless there is a bug
      ? undefined
      : _ instanceof Date // Dates must come in RFC 7231 format
        ? _.toUTCString()
        : `${_}`
];

const getGenericHeaders = () => [
  ['Server', 'poteto'],
  ['Accept-Ranges', 'bytes'],
  ['Date', new Date()],
];

const genericResponse = (status = 200, {
  body = null,
  headers = {},
  opts = {},
} = {}) =>
  new Response(body, {
    ...status = httpOpts.get(status),
    headers: new Headers([
      ...getGenericHeaders().map(stringifyHeader),
      ...status.headers ?? [],
      ...Object.entries(headers),
    ]),
    ...opts,
  });

const computeWeakETag = ({ dev, ino, size, mtimeNs }) =>
  dev !== undefined && ino !== undefined && mtimeNs && size !== undefined
    ? `W/"${[dev, ino, size, mtimeNs].map($ => $?.toString(36) ?? '0').join('-')}"`
    : undefined;

const adjustHeaders = ({ headers }) =>
  new Headers([
    ...getGenericHeaders(),
    ...Object.entries(headers).map(([$, _]) => [
      `${PREFIX}${$}`,
      _,
    ]),

    // TODO: Content-Type?
    ['ETag', computeWeakETag(headers)],
    ['Content-Length', headers.size],
    ['Last-Modified', headers.mtime],
  ]
    .filter(([, $]) => $ !== undefined)
    .map(stringifyHeader)
  );

const statsAsOptions = async (statsOrError, { status } = {}) =>
  Promise.resolve(statsOrError)
    .catch($ => $)
    .then(headers => ({ ...errAsStatus(headers, status), headers }))
    .then($ => Object.assign($, { headers: adjustHeaders($) }));

const tryConditionalResponse = async (headers, stats) => {
  // TODO: use Temporal
  if (headers.has('If-Modified-Since') &&
      stats.mtimeMs < +new Date(headers.get('If-Modified-Since')) ||
      headers.has('If-None-Match') &&
      headers.get('If-None-Match')
        .split(',')
        .map($ => $.trim())
        .includes(computeWeakETag(stats))
  )
    return new Response(
      null,
      await statsAsOptions(stats, { status: 304 })
    );

  if (headers.has('If-Unmodified-Since') &&
      stats.mtimeMs > +new Date(headers.get('If-Unmodified-Since')) ||
      headers.has('If-Match') &&
      !headers.get('If-Match')
        .split(',')
        .map($ => $.trim())
        .includes(computeWeakETag(stats))
  )
    return new Response(
      null,
      await statsAsOptions(stats, { status: 412 })
    );
};

const blockingHooks = [
  // if request.redirect is not follow,
  async (url, { redirect }) => {
    if (redirect === 'follow')
      return;
    const target = await readlink(url).then(pathToFileURL, errorAsUndefined);
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

const getRanges = headers =>
  headers.get('Range')?.split(';')[0].split('=')[1]?.split(',').map($ => $.trim()) ?? [];

export {
  genericResponse,
  getRanges,
  preHooks,
  statsAsOptions,
  tryConditionalResponse,
};
