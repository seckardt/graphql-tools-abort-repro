import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

console.log(`\nExecutor abort-cleanup reproduction (Node ${process.version})`);
console.log('Testing the published, unpatched @graphql-tools/executor 4.1.7.');
console.log('Each case runs in a separate process with --unhandled-rejections=strict.');

for (const control of [false, true]) {
  console.log(control
    ? '\n=== 2. Control: same request abort, successful cleanup ==='
    : '\n=== 1. Reproduction: request abort, failing cleanup ===');
  const result = spawnSync(process.execPath, [
    '--unhandled-rejections=strict',
    'repro.mjs',
    ...(control ? ['--control'] : []),
  ], { cwd: new URL('.', import.meta.url), encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  if (result.stdout) console.log(result.stdout.trimEnd());
  if (result.stderr) console.log(result.stderr.trimEnd());
  console.log(`Child process exit code: ${result.status}`);
  assert.equal(result.signal, null);
  assert.equal(result.status, control ? 0 : 1, result.stdout + result.stderr);
  assert.match(result.stdout, /CALLER_ABORT_HANDLED/);
  assert.match(result.stdout, /CLEANUP_ENTERED/);
  if (control) {
    assert.match(result.stdout, /CONTROL_PASS/);
    assert.equal(result.stderr, '');
  } else {
    assert.match(result.stderr, /Error: CLEANUP_FAILURE/);
    assert.doesNotMatch(result.stderr, /AssertionError|ERR_MODULE_NOT_FOUND|SyntaxError/);
  }
  console.log(control ? 'PASS: control exits 0' : 'PASS: reproduction exits 1 with CLEANUP_FAILURE');
}

console.log('\n=== Explanation ===');
console.log('CALLER_ABORT_HANDLED: the application caught the original request abort.');
console.log('CLEANUP_ENTERED: the executor requested iterator cleanup.');
console.log('CLEANUP_FAILURE: a separate cleanup rejection escaped and terminated the first process.');
console.log('CONTROL_PASS: without a cleanup failure, the identical abort sequence exits normally.');
console.log('BUG REPRODUCED. Verification exits 0 because both expected outcomes were confirmed.');
console.log('This does not mean the executor bug is fixed; it keeps npm install successful.');
console.log('Run npm run repro, npm run control, or npm run verify to repeat these cases.');
