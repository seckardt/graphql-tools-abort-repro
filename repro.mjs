import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { execute } from '@graphql-tools/executor';
import { buildSchema, parse } from 'graphql';

function gate() {
  let open;
  const promise = new Promise(resolve => { open = resolve; });
  return { promise, open };
}

const control = process.argv.includes('--control');
const blocked = gate();
const release = gate();
const cleaned = gate();
const controller = new AbortController();
const reason = new Error('CALLER_ABORT');
let produced = 0;
let cleanupCount = 0;

async function* items() {
  try {
    produced++;
    yield 1;
    blocked.open();
    await release.promise;
    produced++;
    yield 2;
  } finally {
    cleanupCount++;
    console.log('CLEANUP_ENTERED');
    cleaned.open();
    if (!control) throw new Error('CLEANUP_FAILURE');
  }
}

// Observe the caller's rejection before aborting; no global rejection handler.
const pending = Promise.resolve(execute({
  schema: buildSchema('type Query { items: [Int!] }'),
  document: parse('{ items @stream(initialCount: 2) }'),
  rootValue: { items },
  signal: controller.signal,
})).then(
  () => { throw new Error('Expected caller abort rejection'); },
  error => {
    assert.equal(error, reason);
    console.log('CALLER_ABORT_HANDLED');
  },
);

await blocked.promise;
assert.equal(produced, 1);
controller.abort(reason);
await pending;
// Allow the executor's abort callbacks to request cleanup before unblocking next().
await setImmediate();
release.open();
await cleaned.promise;
await setImmediate();
assert.equal(produced, 2);
assert.equal(cleanupCount, 1);
if (control) console.log('CONTROL_PASS');
