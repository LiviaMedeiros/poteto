#!/usr/bin/env node
import { argv, exit, stdin } from 'node:process';
import poteto from '../index.mjs?persistCwd=true';

const [,, url] = argv;

url === undefined && exit(1);
stdin.isTTY && console.log(`writing interactive input to ${url}, press Ctrl+D to stop`);

// writes data from stdin to file
// creates file if it doesn't exist
const response = await poteto(url, { method: 'PUT', body: stdin, duplex: 'half' });
response.ok || console.error(await response.text());
