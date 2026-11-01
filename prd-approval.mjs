import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const assert = (ok, message) => { if (!ok) throw Error(message); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const MAX_PRD_BYTES = 1_000_000;
const roles = ['product', 'business', 'engineering', 'qa'];

export function verifyApproval(p, q, local, pr, reviews, remote, contributionBytes, commits) {
  assert(p.enabled === true, 'baseline inactive');
  assert(['review', 'active'].includes(p.phase), 'invalid approval phase');
  assert(/^[\w.-]+\/[\w.-]+$/.test(p.repo), 'invalid repository');
  assert(/^[a-f0-9]{40}$/.test(p.head), 'invalid approved commit');
  assert(/^[a-f0-9]{64}$/.test(p.sha256), 'invalid approved digest');
  assert(Number.isInteger(p.minReviewers) && p.minReviewers >= 1,
    'invalid independent reviewer minimum');
  for (const role of roles) {
    assert(Array.isArray(p.roles[role]) && p.roles[role].length &&
      p.roles[role].every(Number.isSafeInteger), 'unassigned role: ' + role);
  }
  assert(q.prdId === p.prdId && q.revision === p.revision,
    'wrong PRD identity or revision');
  assert(q.sha256 === p.sha256 && digest(local) === p.sha256 &&
    digest(remote) === p.sha256, 'PRD content mismatch');
  assert(Array.isArray(q.requirements) && q.requirements.length &&
    new Set(q.requirements).size === q.requirements.length &&
    q.requirements.every(id => p.requirements.includes(id)),
    'unapproved or duplicate requirement scope');
  const ids = [...remote.toString('utf8').matchAll(/^(RPT-\d+):/gm)]
    .map(match => match[1]);
  assert(p.requirements.every(id => ids.includes(id)),
    'approved requirement missing from PRD');
  const lifecycle = p.phase === 'active' ? pr.merged === true :
    pr.state === 'open' && pr.merged === false && pr.draft === false;
  assert(pr.number === p.pull && lifecycle &&
    pr.base.repo.full_name.toLowerCase() === p.repo.toLowerCase() &&
    pr.base.ref === p.base && pr.head.sha === p.head,
    'PR does not match the required baseline lifecycle');
  assert(Buffer.isBuffer(local) && Buffer.isBuffer(remote) &&
    local.length <= MAX_PRD_BYTES && remote.length <= MAX_PRD_BYTES,
    'PRD exceeds reference size limit of 1000000 bytes');
  assert(Buffer.isBuffer(contributionBytes) && digest(contributionBytes) === p.contributionSha256,
    'protected contribution record missing or digest mismatch');
  const c = JSON.parse(contributionBytes.toString('utf8'));
  const validId = id => Number.isSafeInteger(id) && id > 0;
  assert(c.schema === 1 && c.coverage === 'complete' &&
    c.repo === p.repo && c.pull === p.pull && c.head === p.head,
    'incomplete or wrong contribution baseline');
  assert(Array.isArray(commits) && commits.length > 0 && commits.length <= 250,
    'unsupported or incomplete PR commit set');
  assert(Array.isArray(c.commits) && c.commits.length === commits.length,
    'contribution record does not cover every PR commit');
  const actualShas = new Set(commits.map(x => x.sha));
  const recordedShas = new Set(c.commits.map(x => x.sha));
  assert(actualShas.size === commits.length && recordedShas.size === commits.length &&
    c.commits.every(x => actualShas.has(x.sha)), 'PR commit coverage mismatch');
  const excluded = new Set([pr.user.id]);
  for (const record of c.commits) {
    const commit = commits.find(x => x.sha === record.sha);
    assert(validId(commit.author?.id) && validId(commit.committer?.id),
      'unresolved commit author or committer identity; supervised resolution required');
    assert(record.authorId === commit.author.id && record.committerId === commit.committer.id,
      'contribution identity differs from host commit mapping');
    assert(Array.isArray(record.additionalContributorIds) &&
      record.additionalContributorIds.every(validId), 'invalid additional contributor record');
    [record.authorId, record.committerId, ...record.additionalContributorIds]
      .forEach(id => excluded.add(id));
  }
  assert(Array.isArray(c.pushes) && c.pushes.length > 0, 'push history unavailable');
  const deliveries = new Set();
  let lastTime = -Infinity;
  for (const push of c.pushes) {
    const time = Date.parse(push.pushedAt);
    assert(validId(push.pusherId) && /^[a-f0-9]{40}$/.test(push.head) &&
      typeof push.deliveryId === 'string' && push.deliveryId.length > 0 &&
      !deliveries.has(push.deliveryId) && Number.isFinite(time) && time >= lastTime,
      'invalid authenticated push record');
    deliveries.add(push.deliveryId); lastTime = time; excluded.add(push.pusherId);
  }
  assert(c.pushes.at(-1).head === p.head, 'last reviewable push does not match head');
  const latest = new Map();
  for (const r of [...reviews].sort((a, b) => a.id - b.id)) {
    if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(r.state)) {
      latest.set(r.user.id, r);
    }
  }
  const authorized = new Set(roles.flatMap(role => p.roles[role]));
  assert(![...latest.values()].some(r => authorized.has(r.user.id) &&
    r.state === 'CHANGES_REQUESTED'), 'authorized reviewer requests changes');
  const approved = [...latest.values()].filter(r =>
    r.state === 'APPROVED' && r.commit_id === p.head &&
    r.user.type === 'User' && !excluded.has(r.user.id) &&
    Number.isFinite(Date.parse(r.submitted_at)) && Date.parse(r.submitted_at) > lastTime &&
    authorized.has(r.user.id));
  const people = new Set(approved.map(r => r.user.id));
  assert(people.size >= p.minReviewers, 'independent review missing');
  for (const role of roles) {
    assert(p.roles[role].some(id => people.has(id)), 'approval missing: ' + role);
  }
  return { phase: p.phase, prdId: p.prdId, revision: p.revision, sha256: p.sha256,
    requirements: q.requirements, pull: p.pull, head: p.head,
    contributionSha256: p.contributionSha256,
    excludedContributorIds: [...excluded].sort((a, b) => a - b),
    lastPushDeliveryId: c.pushes.at(-1).deliveryId,
    reviewIds: approved.map(r => r.id), checkedAt: new Date().toISOString() };
}

export async function checkLive(p, q, local, contributionBytes) {
  const token = process.env.GH_TOKEN;
  assert(token, 'missing read-only API token');
  const api = async path => {
    const r = await fetch('https://api.github.com/repos/' + p.repo + path, {
      headers: { Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      redirect: 'error', signal: AbortSignal.timeout(30000)
    });
    assert(r.ok, 'approval API unavailable: ' + r.status);
    return r.json();
  };
  assert(/^[\w.-]+\/[\w.-]+$/.test(p.repo), 'invalid repository');
  const pr = await api('/pulls/' + p.pull);
  const reviews = [];
  for (let page = 1; ; page++) {
    assert(page <= 100, 'review pagination limit');
    const batch = await api('/pulls/' + p.pull + '/reviews?per_page=100&page=' + page);
    assert(Array.isArray(batch), 'invalid review response');
    reviews.push(...batch);
    if (batch.length < 100) break;
  }
  assert(Number.isInteger(pr.commits) && pr.commits > 0 && pr.commits <= 250,
    'PR commit count exceeds reference limit or is unavailable');
  const commits = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await api('/pulls/' + p.pull + '/commits?per_page=100&page=' + page);
    assert(Array.isArray(batch), 'invalid commit response');
    commits.push(...batch);
    if (batch.length < 100) break;
  }
  assert(commits.length === pr.commits, 'incomplete PR commit retrieval');
  const path = p.path.split('/').map(encodeURIComponent).join('/');
  const file = await api('/contents/' + path + '?ref=' + p.head);
  assert(Number.isSafeInteger(file.size) && file.size >= 0 && file.size <= MAX_PRD_BYTES,
    'PRD exceeds reference size limit of 1000000 bytes or size is unavailable');
  assert(file.type === 'file', 'PRD must be a regular file');
  assert(file.encoding === 'base64' && typeof file.content === 'string',
    'unsupported PRD encoding; reference requires base64 for a small file');
  const remote = Buffer.from(file.content, 'base64');
  assert(remote.length === file.size, 'PRD content length differs from host size');
  const result = verifyApproval(p, q, local, pr, reviews, remote, contributionBytes, commits);
  const again = await api('/pulls/' + p.pull);
  const stable = p.phase === 'active' ? again.merged === true :
    again.state === 'open' && again.merged === false && again.draft === false;
  assert(stable && again.head.sha === p.head && again.commits === pr.commits,
    'baseline changed during verification');
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const p = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const q = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    const evidence = await checkLive(p, q, fs.readFileSync(p.path),
      fs.readFileSync(p.contributionsPath));
    process.stdout.write(JSON.stringify(evidence) + '\n');
  } catch (error) {
    console.error('PRD approval failed: ' + error.message);
    process.exitCode = 1;
  }
}
