import { readlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

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
  [400, { status: 400, statusText: 'Bad Request' }],
  [403, { status: 403, statusText: 'Forbidden' }],
  [404, { status: 404, statusText: 'Not Found' }],
  [405, { status: 405, statusText: 'Method Not Allowed', headers: HEADERS_ALLOW }],
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

const getGenericHeaders = () => new Headers([
  ['Server', 'poteto'],
  ['Accept-Ranges', 'none'],
  ['Date', new Date().toUTCString()],
]);

const genericResponse = (status = 200, {
  body = null,
  headers = {},
  opts = {},
} = {}) =>
  new Response(body, {
    ...status = httpOpts.get(status),
    headers: new Headers([
      ...getGenericHeaders(),
      ...status.headers ?? [],
      ...Object.entries(headers),
    ]),
    ...opts,
  });

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
  errAsStatus,
  genericResponse,
  getGenericHeaders,
  getRanges,
  preHooks,
};
