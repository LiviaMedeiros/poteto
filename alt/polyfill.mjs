import { ProxyRequest } from '../lib/request.mjs';
import { poteto } from '../lib/poteto.mjs';

globalThis.Request = ProxyRequest;
globalThis.fetch = poteto;
