import { sep } from 'node:path';
import { cwd } from 'node:process';
import { pathToFileURL } from 'node:url';

const getCwdURL = () => pathToFileURL(cwd() + sep).href;

const _params = Object.fromEntries(new URL(import.meta.url).searchParams.entries());
const cwdURL = _params.persistCwd
  ? getCwdURL()
  : { [Symbol.toPrimitive]: getCwdURL };

const requestInitOptions = new Set([
  'method',
  'headers',
  'body',
  'referrer',
  'referrerPolicy',
  'mode',
  'credentials',
  'cache',
  'redirect',
  'integrity',
  'keepalive',
  'signal',
  'duplex',
  'priority',
  'window',
]);

const potetoRequestInit = ([ resource, options ], requestInit = {}, url = null) => {
  if (resource instanceof Request) {
    requestInitOptions.forEach($ => requestInit[$] = resource[$]);
    resource = resource.url;
  }
  return [
    (url = new URL(resource, cwdURL)).protocol === 'file:'
      ? url
      : resource,
    { ...requestInit, ...options },
  ];
};

class PotetoRequest extends Request {
  constructor(...$) {
    super(...potetoRequestInit($));
  }
}

const ProxyRequest = new Proxy(Request, {
  construct: (target, argumentsList) =>
    Reflect.construct(target, potetoRequestInit(argumentsList))
});

export {
  PotetoRequest,
  ProxyRequest,
};
