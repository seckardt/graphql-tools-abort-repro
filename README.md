# Executor abort cleanup rejection

Standalone reproduction for [graphql-tools issue #8647](https://github.com/ardatan/graphql-tools/issues/8647).
Related fix: [8d7b95a](https://github.com/seckardt/graphql-tools/commit/8d7b95a90b9c52a1a1d853d029430d95cc5fbca8).

## Run

Requires Node.js 24 or newer (tested on 24.13.0) and npm.
The only direct dependencies are exactly `@graphql-tools/executor@4.1.7`
(the npm `latest` tag when verified) and `graphql@17.0.2`.
The lockfile pins transitive dependencies. No server, Yoga, network endpoint,
credentials, patches, or environment overrides are needed.

```sh
npm ci
npm run repro    # Expected reproduction outcome: exit 1
npm run control  # Exit 0
npm run verify   # Exit 0 if both outcomes match
```

`npm install` and `npm ci` automatically run verification through `postinstall`,
including when StackBlitz installs the project. The terminal shows both child
process outputs, their exit codes, and an explanation of each diagnostic marker.
Installation succeeds when the bug and the passing control are both confirmed;
an unexpected outcome fails verification and installation. If lifecycle scripts
are disabled, run `npm run verify` manually.

## Sequence

The query is `{ items @stream(initialCount: 2) }`. The async generator yields
`1`, signals that it has blocked before yielding `2`, and waits on an explicit
gate. The caller attaches its rejection handler before aborting. After the gate
signals, the caller aborts with an `Error('CALLER_ABORT')` and asserts that the
execution promise rejects with that exact error. One `setImmediate` turn allows
the executor's abort callbacks to request cleanup before the generator is released.
The generator then yields `2` and its `finally` throws `CLEANUP_FAILURE`.
There are no timer-based ordering assumptions or global rejection handlers.

## Expected versus actual

**Expected library behavior:** the executor observes the iterator cleanup
rejection; handling the original abort rejection should not leave a separate
unhandled promise rejection that terminates the process.

**Actual behavior on executor 4.1.7:** the caller successfully handles the abort,
but cleanup produces an independent unhandled rejection. Strict Node exits 1:

```text
CALLER_ABORT_HANDLED
CLEANUP_ENTERED
...repro.mjs:33
    if (!control) throw new Error('CLEANUP_FAILURE');
                        ^

Error: CLEANUP_FAILURE
    at Object.items (...repro.mjs:33:25)

Node.js v24.13.0
```

Paths in the stack trace depend on where the reproduction is installed.

The control uses the identical abort sequence, but does not throw in `finally`.
It asserts that two values were produced and cleanup ran exactly once, then exits 0:

```text
CALLER_ABORT_HANDLED
CLEANUP_ENTERED
CONTROL_PASS
```

`verify.mjs` runs each case in a separate strict child process, checks exit
codes and markers, and requires the reproduction's `CLEANUP_FAILURE` stack trace
so a setup/import/assertion failure is not mistaken for the bug. Its 10-second
timeout is only a hung-process safeguard, not part of the reproduction ordering.

```text
PASS: reproduction exits 1 with CLEANUP_FAILURE
PASS: control exits 0
```

Verification passing means the bug was reproduced, **not** that it was fixed.
