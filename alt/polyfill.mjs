import { ProxyRequest } from '#request.mjs';
import { poteto } from '#poteto.mjs';

globalThis.Request = ProxyRequest;
globalThis.fetch = poteto;
