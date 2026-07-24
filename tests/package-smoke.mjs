import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const esm = await import('../dist/index.js');
assert.equal(typeof esm.PrettyJsBridge.register, 'function');
assert.equal(typeof esm.androidTransport, 'function');

const require = createRequire(import.meta.url);
const cjs = require('../dist/index.cjs');
assert.equal(typeof cjs.PrettyJsBridge.register, 'function');
assert.equal(typeof cjs.iosTransport, 'function');

const umdSource = await readFile(
  new URL('../dist/index.umd.js', import.meta.url),
  'utf8',
);
const context = {};
vm.runInNewContext(umdSource, context);
assert.equal(typeof context.PrettyJsBridge.register, 'function');
assert.equal(typeof context.PrettyJsBridge.flutterTransport, 'function');

console.log('ESM, CommonJS and UMD smoke tests passed.');
