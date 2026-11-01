import fs from 'node:fs';

// Run in trusted CI; review this checker and the selected policy.
try {
  const [policyPath, reportPath, runnerExit] = process.argv.slice(2);
  const p = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  const r = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const assert = (ok, why) => { if (!ok) throw Error(why); };
  const key = (id, project) => `${id}@${project}`;
  const validId = id => /^(?:AC|S)-\d+$/.test(id);
  assert(runnerExit === '0', 'runner did not exit successfully');
  assert(p.schema === 2, 'unsupported policy schema');
  assert(p.story && p.requirementRevision, 'missing approved scope');
  assert(Array.isArray(p.required) && p.required.length,
    'required scenario list is empty');
  assert(Array.isArray(p.allowedSkips), 'missing allowedSkips list');
  assert(p.allowedSkips.every(k => /^(?:AC|S)-\d+@.+$/.test(k)),
    'invalid allowed skip key');
  assert(Number.isInteger(p.repetitions) && p.repetitions > 0,
    'invalid repetition count');
  assert(Array.isArray(r.suites), 'missing reporter suites');
  assert(Array.isArray(r.errors) && !r.errors.length,
    'report contains global errors');
  assert(r.config?.forbidOnly === true, 'forbidOnly was not enabled');
  assert(!r.config.shard, 'aggregate and qualify sharded evidence first');
  const required = new Set();
  const scenarios = new Set();
  const skipped = new Set(p.allowedSkips);
  for (const q of p.required) {
    assert(/^S-\d+$/.test(q.id) && validId(q.testId) && q.project,
      'invalid scenario mapping');
    const scenario = key(q.id, q.project);
    const k = key(q.testId, q.project);
    assert(!scenarios.has(scenario), `duplicate scenario ${scenario}`);
    assert(!required.has(k), `duplicate native test mapping ${k}`);
    assert(!skipped.has(k), `required test may not be skipped: ${k}`);
    scenarios.add(scenario);
    required.add(k);
  }
  const seen = new Map();
  let executed = 0;
  function visit(suite, parents = []) {
    assert(Array.isArray(suite.suites ?? []) &&
      Array.isArray(suite.specs ?? []), 'malformed reporter suite');
    const path = [...parents, suite.title];
    for (const spec of suite.specs ?? []) {
      const ids = [...spec.title.matchAll(/\b(?:AC|S)-\d+\b/g)];
      assert(ids.length <= 1, 'use one native test ID per title');
      assert(Array.isArray(spec.tests) && spec.tests.length,
        'test entry has no project results');
      const origin = JSON.stringify([
        spec.file, spec.line, spec.column, ...path, spec.title
      ]);
      for (const t of spec.tests) {
        const id = ids[0]?.[0];
        const k = id ? key(id, t.projectName) :
          JSON.stringify(['support', origin, t.projectName]);
        const entry = seen.get(k) ?? { origin, tests: [] };
        assert(t.projectName && entry.origin === origin,
          `ambiguous/duplicate test definition: ${k}`);
        assert(Array.isArray(t.results) && t.results.length,
          `no execution result for ${k}`);
        entry.tests.push(t);
        seen.set(k, entry);
        const statuses = t.results.map(v => v.status);
        if (statuses.every(v => v === 'skipped')) {
          assert(skipped.has(k) && !required.has(k),
            `unexpected skip: ${k}`);
          continue;
        }
        assert(t.expectedStatus === 'passed',
          `expected-failure annotation is not accepted: ${k}`);
        assert(t.status === 'expected', `unexpected/flaky outcome: ${k}`);
        assert(statuses.every(v => v === 'passed'),
          `a failed, interrupted, or skipped attempt exists: ${k}`);
        executed++;
      }
    }
    for (const child of suite.suites ?? []) visit(child, path);
  }
  r.suites.forEach(suite => visit(suite));
  assert(executed > 0, 'no tests executed successfully');
  for (const k of required) {
    const entry = seen.get(k);
    assert(entry && entry.tests.length === p.repetitions &&
      entry.tests.every(t => t.results.every(v => v.status === 'passed')),
      `required test did not execute and pass: ${k}`);
  }
  console.log(`PASS: ${required.size} required scenario/project pairs`);
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}
