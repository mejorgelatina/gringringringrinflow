import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/golden-set.json'), 'utf8'));
const base = process.env.GRINFLOW_BASE_URL || 'http://localhost:3000';
const checks = [];
for (const c of data.cases) {
  let response;
  try {
    response = await fetch(`${base}/api/intake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: c.body }) });
  } catch {
    console.error(`Could not reach ${base}. Start the app with npm run dev first.`);
    process.exit(2);
  }
  const result = await response.json();
  const events = result.extraction?.events || [];
  const expected = c.expect || {};
  const actualEvent = events[0] || null;
  const actual = {
    kind: actualEvent?.kind ?? null,
    quantity: actualEvent?.quantity ?? null,
    unit: actualEvent?.unit ?? null,
    category: actualEvent?.category ?? null,
    edibility: actualEvent?.condition ?? 'unknown',
    needsReview: result.extraction?.needs_review ?? null,
    eventCount: events.length
  };
  const fields = ['kind','quantity','unit','category','edibility','needsReview','eventCount'];
  const fieldResults = {};
  for (const field of fields) {
    if (!(field in expected)) continue;
    // Event count is only specified in a few multi-event cases.
    fieldResults[field] = actual[field] === expected[field];
  }
  const applicable = Object.keys(fieldResults);
  const passed = applicable.filter(k => fieldResults[k]).length;
  const total = applicable.length;
  checks.push({ id: c.id, pass: passed === total, passed, total, provider: result.provider || 'error', fields: fieldResults, actual, expected });
  console.log(`${passed === total ? 'PASS' : 'FAIL'} ${c.id} (${passed}/${total})`);
}
const totalChecks = checks.reduce((n,c) => n+c.total,0);
const passedChecks = checks.reduce((n,c) => n+c.passed,0);
const summary = {
  timestamp: new Date().toISOString(),
  baseUrl: base,
  note: 'This is a simple field-exactness harness, not a calibrated model-quality benchmark. Review failures and safety-critical cases individually.',
  cases: checks.length,
  passedCases: checks.filter(c => c.pass).length,
  fieldChecksPassed: passedChecks,
  fieldChecksTotal: totalChecks,
  fieldAccuracy: totalChecks ? Number((passedChecks / totalChecks).toFixed(4)) : null,
  providers: [...new Set(checks.map(c => c.provider))],
  results: checks
};
const out = path.join(process.cwd(), 'golden-eval-report.json');
fs.writeFileSync(out, JSON.stringify(summary, null, 2));
console.log(`\nField checks: ${passedChecks}/${totalChecks} (${(100*passedChecks/totalChecks).toFixed(1)}%)`);
console.log(`Case exact match: ${summary.passedCases}/${summary.cases}`);
console.log(`Report: ${out}`);
console.log('Do not treat aggregate accuracy as a substitute for reviewing unsafe false positives.');
