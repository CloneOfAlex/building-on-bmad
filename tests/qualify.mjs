import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyApproval, checkLive } from '../prd-approval.mjs';
const bytes = fs.readFileSync(new URL('../examples/product/export/PRD.md', import.meta.url));
const sha = createHash('sha256').update(bytes).digest('hex');
const head = 'a'.repeat(40);
const p = { enabled: true, phase: 'active', repo: 'example-org/example-repo',
  base: 'main', prdId: 'PRD-EXPORT', revision: 'prd-r3',
  path: 'product/export/PRD.md', pull: 17, head, sha256: sha,
  requirements: ['RPT-01', 'RPT-02', 'RPT-03', 'RPT-04'], minReviewers: 4,
  roles: { product: [1001], business: [1002], engineering: [1003], qa: [1004] } };
const q = { prdId: p.prdId, revision: p.revision, sha256: sha,
  requirements: ['RPT-01', 'RPT-02'] };
const pr = { number: 17, merged: true, state: 'closed', draft: false,
  base: { repo: { full_name: p.repo }, ref: p.base }, head: { sha: head },
  user: { id: 2001 }, commits: 1 };
const reviews = [1001, 1002, 1003, 1004].map((id, i) => ({ id: i + 1, state: 'APPROVED',
  user: { id, type: 'User' }, commit_id: head, submitted_at: '2026-10-30T12:10:00Z' }));
const commits = [{ sha: head, author: { id: 2001 }, committer: { id: 2002 } }];
const contributions = { schema: 1, coverage: 'complete', repo: p.repo, pull: p.pull, head,
  commits: [{ sha: head, authorId: 2001, committerId: 2002, additionalContributorIds: [] }],
  pushes: [{ head, pusherId: 2003, pushedAt: '2026-10-30T12:00:00Z', deliveryId: 'push-17-1' }] };
const encoded = c => Buffer.from(JSON.stringify(c, null, 2) + '\n');
const contributionBytes = encoded(contributions);
p.contributionSha256 = createHash('sha256').update(contributionBytes).digest('hex');
p.contributionsPath = '/trusted/contributions-17.json';
const fresh = () => ({ p: structuredClone(p), q: structuredClone(q),
  local: bytes, remote: bytes, pr: structuredClone(pr), reviews: structuredClone(reviews),
  contributionBytes, commits: structuredClone(commits) });
const results = [];
const run = x => verifyApproval(x.p, x.q, x.local, x.pr, x.reviews, x.remote, x.contributionBytes, x.commits);
function test(name, mutate, shouldPass = false) {
  const x = fresh(); mutate(x);
  if (shouldPass) assert.ok(run(x)); else assert.throws(() => run(x));
  results.push({ name, expected: shouldPass ? 'pass' : 'reject', passed: true });
}
test('clean active baseline', () => {}, true);
test('clean review phase', x => { x.p.phase = 'review'; x.pr.state = 'open'; x.pr.merged = false; }, true);
test('inactive baseline', x => x.p.enabled = false);
test('wrong revision', x => x.q.revision = 'prd-r2');
test('wrong request digest', x => x.q.sha256 = '0'.repeat(64));
test('changed local PRD', x => x.local = Buffer.from('changed'));
test('changed remote PRD', x => x.remote = Buffer.from('changed'));
test('unauthorized reviewer', x => x.reviews[1].user.id = 9999);
test('bot approval', x => x.reviews[1].user.type = 'Bot');
test('author approval', x => x.pr.user.id = 1002);
test('missing QA responsibility', x => x.p.roles.qa = [1005]);
test('old commit approval', x => x.reviews[1].commit_id = 'b'.repeat(40));
test('dismissed approval', x => x.reviews[1].state = 'DISMISSED');
test('later change request', x => x.reviews.push({ ...x.reviews[1], id: 5, state: 'CHANGES_REQUESTED' }));
test('comment preserves approval', x => x.reviews.push({ ...x.reviews[1], id: 5, state: 'COMMENTED' }), true);
test('new approval after change request', x => { x.reviews.push({ ...x.reviews[1], id: 5, state: 'CHANGES_REQUESTED' }, { ...x.reviews[1], id: 6 }); }, true);
test('unmerged active PR', x => x.pr.merged = false);
test('merged proposal cannot be review phase', x => x.p.phase = 'review');
test('draft review PR', x => { x.p.phase = 'review'; x.pr.state = 'open'; x.pr.merged = false; x.pr.draft = true; });
test('wrong base branch', x => x.pr.base.ref = 'other');
test('wrong repository', x => x.pr.base.repo.full_name = 'other/repo');
test('wrong PR number', x => x.pr.number = 18);
test('head changed', x => x.pr.head.sha = 'b'.repeat(40));
test('unapproved requirement', x => x.q.requirements = ['RPT-05']);
test('empty scope', x => x.q.requirements = []);
test('duplicate scope', x => x.q.requirements = ['RPT-01', 'RPT-01']);
test('unassigned role', x => x.p.roles.business = []);
test('insufficient distinct reviewers', x => x.p.minReviewers = 5);
test('two-person mode with qualified independent reviewer', x => { x.p.minReviewers = 1; for (const role of Object.keys(x.p.roles)) x.p.roles[role] = [1001]; x.reviews = [x.reviews[0]]; }, true);

// Exercise the actual API adapter with synthetic responses, including pagination.
function ledger(x, mutate) {
  const c = JSON.parse(x.contributionBytes); mutate(c);
  x.contributionBytes = encoded(c);
  x.p.contributionSha256 = createHash('sha256').update(x.contributionBytes).digest('hex');
}
test('last pusher cannot satisfy QA approval', x => ledger(x, c => c.pushes[0].pusherId = 1004));
test('committer cannot satisfy QA approval', x => { x.commits[0].committer.id = 1004; ledger(x, c => c.commits[0].committerId = 1004); });
test('author cannot satisfy QA approval', x => { x.commits[0].author.id = 1004; ledger(x, c => c.commits[0].authorId = 1004); });
test('earlier pusher cannot satisfy QA approval', x => ledger(x, c => c.pushes.unshift({ ...c.pushes[0], deliveryId: 'earlier', pusherId: 1004, pushedAt: '2026-10-30T11:00:00Z' })));
test('additional contributor cannot satisfy QA approval', x => ledger(x, c => c.commits[0].additionalContributorIds = [1004]));
test('review before latest push rejected', x => x.reviews[3].submitted_at = '2026-10-30T11:59:59Z');
test('review simultaneous with push held', x => x.reviews[3].submitted_at = '2026-10-30T12:00:00Z');
test('invalid review timestamp rejected', x => x.reviews[3].submitted_at = 'unknown');
test('missing contribution evidence rejected', x => x.contributionBytes = undefined);
test('untrusted ledger edit rejected', x => x.contributionBytes = Buffer.from('{}'));
test('incomplete ledger rejected', x => ledger(x, c => c.coverage = 'partial'));
test('wrong ledger head rejected', x => ledger(x, c => c.head = 'b'.repeat(40)));
test('missing commit record rejected', x => ledger(x, c => c.commits = []));
test('extra API commit requires coverage', x => x.commits.push({ ...x.commits[0], sha: 'b'.repeat(40) }));
test('different commit set rejected', x => ledger(x, c => c.commits[0].sha = 'b'.repeat(40)));
test('unmapped author identity held', x => x.commits[0].author = null);
test('unmapped committer identity held', x => x.commits[0].committer = null);
test('host and ledger identity mismatch rejected', x => ledger(x, c => c.commits[0].authorId = 999));
test('missing push history rejected', x => ledger(x, c => c.pushes = []));
test('missing pusher identity rejected', x => ledger(x, c => delete c.pushes[0].pusherId));
test('last pushed head mismatch rejected', x => ledger(x, c => c.pushes[0].head = 'b'.repeat(40)));
test('duplicate delivery rejected', x => ledger(x, c => c.pushes.push(c.pushes[0])));
test('invalid push timestamp rejected', x => ledger(x, c => c.pushes[0].pushedAt = 'unknown'));
test('CRLF local checkout fails with LF baseline', x => x.local = Buffer.from(bytes.toString().replace(/\n/g, '\r\n')));
test('bullet requirement format rejected', x => { x.local = x.remote = Buffer.from(bytes.toString().replace('RPT-01:', '- RPT-01:')); x.p.sha256 = x.q.sha256 = createHash('sha256').update(x.local).digest('hex'); });
test('bold requirement format rejected', x => { x.local = x.remote = Buffer.from(bytes.toString().replace('RPT-01:', '**RPT-01**:')); x.p.sha256 = x.q.sha256 = createHash('sha256').update(x.local).digest('hex'); });
const originalFetch = globalThis.fetch;
process.env.GH_TOKEN = 'synthetic-read-token';
async function apiTest(name, options = {}, shouldPass = false) {
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(new URL(url).host, 'api.github.com');
    assert.equal(init.redirect, 'error');
    if (options.httpError) return { ok: false, status: 503 };
    if (options.networkError) throw Error('synthetic network failure');
    let value;
    if (url.includes('/reviews?')) {
      const page = Number(new URL(url).searchParams.get('page'));
      if (page === 1 && options.paginate) value = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, state: 'COMMENTED', user: { id: 5000 + i }, commit_id: head }));
      else if (options.badPage) value = { partial: true };
      else value = reviews;
    } else if (url.includes('/commits?')) {
      value = structuredClone(commits);
      if (options.incompleteCommits) value = [];
    } else if (url.includes('/contents/')) {
      value = { type: 'file', size: bytes.length, encoding: 'base64', content: bytes.toString('base64') };
      if (options.badFile) value.encoding = 'none';
      if (options.largeFile) value.size = 1_000_001;
      if (options.badSize) value.size += 1;
    } else {
      value = structuredClone(pr);
      if (options.race && calls > 1) value.head.sha = 'b'.repeat(40);
    }
    return { ok: true, status: 200, json: async () => value };
  };
  try {
    if (shouldPass) assert.ok(await checkLive(p, q, bytes, contributionBytes));
    else await assert.rejects(() => checkLive(p, q, bytes, contributionBytes));
    results.push({ name, expected: shouldPass ? 'pass' : 'reject', passed: true });
  } finally { globalThis.fetch = originalFetch; }
}
await apiTest('clean API adapter', {}, true);
await apiTest('all review pages retrieved', { paginate: true }, true);
await apiTest('API HTTP error holds execution', { httpError: true });
await apiTest('API transport error holds execution', { networkError: true });
await apiTest('malformed review retrieval rejected', { badPage: true });
await apiTest('unsupported source representation rejected', { badFile: true });
await apiTest('head changes during adapter run', { race: true });
await apiTest('oversize file rejected explicitly', { largeFile: true });
await apiTest('file size mismatch rejected', { badSize: true });
await apiTest('incomplete API commits held', { incompleteCommits: true });
delete process.env.GH_TOKEN;
await assert.rejects(() => checkLive(p, q, bytes, contributionBytes));
results.push({ name: 'missing API credential', expected: 'reject', passed: true });

// Complete-row multiset comparison, without inventing an export ordering rule.
const canonicalRows = items => items.map(row =>
  JSON.stringify(Object.keys(row).sort().map(key => [key, row[key]]))
).sort();
const rowA = { report_id: 'r1', value: '10' }, rowB = { report_id: 'r1', value: '20' };
const rowCases = [
  ['permuted rows accepted', [rowB, rowA], [rowA, rowB], true],
  ['changed values rejected', [rowA], [rowB], false],
  ['different identity rejected', [{ report_id: 'r2', value: '10' }], [rowA], false],
  ['duplicate count retained', [rowA, rowA], [rowA], false],
  ['missing row rejected', [rowA], [rowA, rowB], false],
  ['additional field rejected', [{ ...rowA, extra: 'x' }], [rowA], false]
];
for (const [name, a, b, expected] of rowCases) {
  assert.equal(JSON.stringify(canonicalRows(a)) === JSON.stringify(canonicalRows(b)), expected);
  results.push({ name, expected: expected ? 'match' : 'mismatch', passed: true });
}
fs.writeFileSync(new URL('../qualification.json', import.meta.url), JSON.stringify({
  approvalControls: results.length - rowCases.length, rowControls: rowCases.length,
  allPassed: true, liveRepositoryValidation: false, cases: results
}, null, 2));
console.log(JSON.stringify({ approvalControls: results.length - rowCases.length,
  rowControls: rowCases.length, allPassed: true, liveRepositoryValidation: false }));
