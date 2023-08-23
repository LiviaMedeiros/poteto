#!/usr/bin/env node
import poteto from '../index.mjs?persistCwd=true';

const [,, url] = process.argv;

url === undefined && process.exit(1);
process.stdin.isTTY && console.log(`writing interactive input to ${url}, press Ctrl+D to stop`);

// writes data from stdin to file
// creates file if it doesn't exist
const response = await poteto(url, { method: 'PUT', body: process.stdin, duplex: 'half' });
response.ok || console.error(await response.text());
