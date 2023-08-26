import {
  PotetoRequest,
  ProxyRequest,
} from '#request.mjs';
import {
  methods,
  execute,
} from '#methods.mjs';

// fair proxy
const proxify = $ => new Proxy($, {
  async apply(target, thisArg, argumentsList) {
    const request = new ProxyRequest(...argumentsList);
    const url = new URL(request.url);

    return url.protocol === 'file:'
      ? execute(request, url)
      : Reflect.apply(target, thisArg, argumentsList);
  },
});

const unbound = async (_, ...$) => {
  const request = new PotetoRequest(...$);
  const url = new URL(request.url);

  return url.protocol === 'file:'
    ? execute(request, url)
    : _(...$);
};
const wrap = $ => unbound.bind(null, $);

// separate function
const ponyfill = wrap(fetch);

// cutting corners proxy
const apply = wrap(Reflect.apply.bind(Reflect, fetch, undefined));
const poteto = new Proxy(fetch, {
  apply: (_, __, $) => apply(...$),
});

export {
  execute,
  methods,
  ponyfill,
  poteto,
  proxify,
  wrap,
};
