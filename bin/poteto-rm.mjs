#!/usr/bin/env node
import poteto from '../index.mjs?persistCwd=true';

const [,, ...urls] = process.argv;

// deletes file
// not recursive
// not interactive!
await Promise.all(urls.map(url =>
  poteto(url, { method: 'DELETE' })
));
