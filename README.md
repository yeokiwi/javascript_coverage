# jscov

Statement, decision, and **MC/DC** coverage for JavaScript, TypeScript, and JSX.

Instruments source code through Babel (extending `babel-plugin-istanbul` for
statement / branch coverage, with a custom MC/DC pass on top), runs the code,
analyzes the observations, and emits text / JSON / HTML reports. Both
**classic (masking)** and **unique-cause** MC/DC are computed.

## Install

```
npm install
```

## CLI

```
jscov run   [flags] <entry.js>              # in-process run of an entry file
jscov test  [flags] -- <command> [args...]  # spawn a test runner with hook
jscov report --input=coverage-raw.json [flags]
jscov instrument <file>                     # dump instrumented source to stdout
```

### Flags

| flag                 | meaning                                                 |
|----------------------|---------------------------------------------------------|
| `--config=<path>`    | Explicit path to `jscov.config.(js|cjs|json)`.         |
| `--root=<dir>`       | Project root (include/exclude matching is relative).   |
| `--include=<glob,…>` | Instrument only files matching these globs.            |
| `--exclude=<glob,…>` | Skip files matching these globs.                       |
| `--reporters=<list>` | Any of `text`, `json`, `html`. Default `text`.         |
| `--output=<dir>`     | Output directory for JSON/HTML (default `coverage`).   |
| `--no-mcdc`          | Disable MC/DC (statement + branch only).               |
| `--verbose`          | Text reporter: print per-decision MC/DC details.       |

### Examples

Run an entry script and print a text report:

```
node bin/jscov.js run --root . --include 'examples/**' --verbose examples/main.js
```

Run tests under an external command (e.g. `mocha`, `ava`, plain `node`):

```
node bin/jscov.js test --include 'src/**' --reporters=text,html \
    --output coverage -- npx mocha test/
```

Generate only JSON + HTML:

```
node bin/jscov.js run --reporters=json,html --output coverage examples/main.js
```

## Config file

`jscov.config.js` (or `.cjs` / `.json`) is auto-discovered at the project root:

```js
// jscov.config.js
module.exports = {
  mode: 'command',                     // 'script' | 'command'
  command: 'npx',                      // for mode: 'command'
  args: ['mocha', 'test/**/*.js'],
  include: ['src/**', 'lib/**'],
  exclude: ['**/*.test.js'],
  reporters: ['text', 'html'],
  outputDir: 'coverage',
  mcdc: true,
  verbose: false,
};
```

CLI flags override file values.

## What each metric means

- **Statement coverage** — every instrumented statement executed at least once.
  (Provided by Istanbul.)
- **Branch coverage** — for every branching construct (if/else, switch case,
  `?:`, `&&`, `||`, `??`), every outgoing branch taken at least once.
  (Provided by Istanbul.)
- **Decision coverage** — for every boolean decision, both outcomes (`true`
  and `false`) observed.
- **Condition coverage** — for every atomic boolean sub-condition in a
  decision, both values (`true` and `false`) observed.
- **MC/DC** — for every atomic sub-condition, an "independence pair" of
  observations that shows the atom independently affects the decision:
  - **Classic (masking)** — non-target atoms are allowed to differ when the
    difference is masked by short-circuit evaluation (un-evaluated atoms are
    treated as don't-care).
  - **Unique-cause** — non-target atoms must match exactly. Stricter, and
    sometimes theoretically infeasible for decisions with short-circuit
    operators (that's why MC/DC standards also permit the classic / masking
    variant).

## How it works

```
source ─▶ @babel/parser ─▶
  ├─▶ @babel/preset-typescript (TS → JS)
  ├─▶ @babel/preset-react      (JSX → React.createElement)
  ├─▶ jscov MC/DC plugin       (wrap decisions + atoms)
  └─▶ babel-plugin-istanbul    (statement/branch counters)
  ─▶ @babel/generator ─▶ instrumented source
```

For each boolean decision (test of `if`, `while`, `do-while`, `for`, and
ternary `ConditionalExpression`) the MC/DC plugin:

1. Walks through `&&`, `||`, `??`, `!` to find *atomic* sub-conditions (the
   leaves).
2. Wraps each atom with `__jscov_c__(FID, decId, idx, C)` — records the runtime
   truth value then returns `C`. Atoms that don't execute (short-circuit) keep
   the initial `null` (shown as `X` in reports).
3. Wraps the decision with `(__jscov_rd__(FID, decId), __jscov_rec__(FID, decId,
   EXPR))` — the comma operator lets the reset run **before** `EXPR` is
   evaluated, then the recorder commits a unique `(atoms, outcome)` observation.

A prelude installs the helpers (once) on `globalThis` and registers each file's
metadata on `global.__coverage__[filename]`. Observations are deduplicated and
counted. Summaries are computed at report time by `src/coverage/summary.js`.

## Programmatic API

```js
const {
  instrument,
  runScript, runCommand,
  summarize,
  reportText, reportJson, renderHtml,
} = require('./src');

const { code } = instrument(sourceString, '/abs/path/file.ts');
const cov     = await runScript({ entry: '/abs/path/entry.js', root: '.' });
const summary = summarize(cov);
console.log(reportText(summary, { verbose: true }));
```

## Limitations

- CommonJS require hook only; ESM modules are not instrumented. (Use
  `jscov test -- node --experimental-loader=… your-command` or precompile to
  CJS as a workaround.)
- Async expressions inside a single decision (e.g. `if (await a() && b())`)
  use a single module-level atom vector; interleaved concurrent evaluations of
  the same decision are not fully supported.
- Switch statements aren't tracked as MC/DC decisions (only statement + branch
  via Istanbul).
- Unique-cause MC/DC can be theoretically infeasible when short-circuit
  operators prevent observing an atom independently; use classic MC/DC in
  those cases (both are reported side-by-side).

## Tests

```
npm test
```
