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
  [302, { status: 302, statusText: 'Found' }],
  [400, { status: 400, statusText: 'Bad Request' }],
  [403, { status: 403, statusText: 'Forbidden' }],
  [404, { status: 404, statusText: 'Not Found' }],
  [405, { status: 405, statusText: 'Method Not Allowed', headers: HEADERS_ALLOW }],
  [422, { status: 422, statusText: 'Unprocessable Content' }],
  [500, { status: 500, statusText: 'Internal Server Error' }],
  [501, { status: 501, statusText: 'Not Implemented', headers: HEADERS_ALLOW }],
  [503, { status: 503, statusText: 'Service Unavailable' }],
]);

const errAsStatus = err =>
  httpOpts.get(err instanceof Error
    ? httpErrs.get(err.code)
    : 200
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
    ...(status = httpOpts.get(status)),
    headers: new Headers([
      ...getGenericHeaders(),
      ...(status.headers ?? []),
      ...Object.entries(headers),
    ]),
    ...opts,
  });

export {
  errAsStatus,
  genericResponse,
  getGenericHeaders,
};
