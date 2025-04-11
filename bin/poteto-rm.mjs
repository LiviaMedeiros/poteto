#!/usr/bin/env node
import { argv } from 'node:process';
import poteto from '../index.mjs?persistCwd=true';

const [,, ...urls] = argv;

// deletes file
// not recursive
// not interactive!
await Promise.all(urls.map(url =>
  poteto(url, { method: 'DELETE' })
));
