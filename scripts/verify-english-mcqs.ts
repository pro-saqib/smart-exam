import { Database } from 'bun:sqlite';

const SQLITE_PATH = './.wrangler/state/v3/d1/miniflare-D1DatabaseObject/162b09b8c67e3fafda77330427d4549c676383a88b8302c1c67b4028ca2ddb1e.sqlite';

const ENGLISH_SUBTOPICS = [
  'ppsc_ee8a90a2b58e70e5',
  'ppsc_384c271fa41997c3',
  'ppsc_2ebcf5b7f8fe9306',
  'ppsc_d723f1b7075eee65',
  'ppsc_741c41c4d40c5ee0',
  'ppsc_5cf1bccc2fa112eb',
  'ppsc_c877e3a404b219fc',
];

function runVerification() {
  console.log('=== Running English MCQs Verification Suite ===\n');

  const db = new Database(SQLITE_PATH);
  const rows = db.query(`SELECT id, subject_id, question, options, correct, explanation FROM mcq WHERE subject_id IN ('${ENGLISH_SUBTOPICS.join("','")}') ORDER BY id`).all() as any[];

  let passed = true;
  const errors: string[] = [];

  // Check 1: Total Count
  console.log(`1. Total English MCQs in DB: ${rows.length}`);
  if (rows.length !== 2467) {
    errors.push(`Expected 2467 MCQs, got ${rows.length}`);
    passed = false;
  }

  // Check 2: Zero Null / Invalid Correct Keys
  const invalidKeys = rows.filter(r => !r.correct || !['A', 'B', 'C', 'D', 'E'].includes(r.correct));
  console.log(`2. MCQs with null/invalid correct key: ${invalidKeys.length}`);
  if (invalidKeys.length > 0) {
    errors.push(`Found ${invalidKeys.length} MCQs with invalid correct key: ${invalidKeys.map(k => k.id).join(', ')}`);
    passed = false;
  }

  // Check 3: Zero Embedded Option Markers in Question Stems (excluding honorifics like (R.A))
  const embeddedStems = rows.filter(r => /(?:\([A-D]\)|^[A-D]\)|(?:\s+|^)[A-D]\))\s+/.test(r.question));
  console.log(`3. MCQs with embedded option markers in stem: ${embeddedStems.length}`);
  if (embeddedStems.length > 0) {
    errors.push(`Found ${embeddedStems.length} MCQs with embedded markers: ${embeddedStems.map(s => s.id).join(', ')}`);
    passed = false;
  }

  // Check 4: Zero Duplicate Options in Choices (excluding intentional capitalization questions)
  const duplicateOpts = rows.filter(r => {
    try {
      const opts = JSON.parse(r.options);
      // If the question is explicitly testing capitalization, compare exact strings
      const isCapitalizationTest = /capitali[sz]ation/i.test(r.question);
      const vals = Object.values(opts).map(v => isCapitalizationTest ? (v as string || '').trim() : (v as string || '').trim().toLowerCase()).filter(Boolean);
      return new Set(vals).size < vals.length;
    } catch (e) {
      return true;
    }
  });
  console.log(`4. MCQs with duplicate option values: ${duplicateOpts.length}`);
  if (duplicateOpts.length > 0) {
    errors.push(`Found ${duplicateOpts.length} MCQs with duplicate options: ${duplicateOpts.map(d => d.id).join(', ')}`);
    passed = false;
  }

  // Check 5: Model Papers Chunking Verification (1-25)
  const totalPapers = Math.ceil(rows.length / 100);
  console.log(`5. Model Papers Chunks: ${totalPapers} Papers`);
  if (totalPapers !== 25) {
    errors.push(`Expected 25 model papers, got ${totalPapers}`);
    passed = false;
  }

  for (let p = 1; p <= totalPapers; p++) {
    const start = (p - 1) * 100;
    const slice = rows.slice(start, start + 100);
    const expectedLength = p === 25 ? 67 : 100;
    if (slice.length !== expectedLength) {
      errors.push(`Paper ${p} has ${slice.length} MCQs, expected ${expectedLength}`);
      passed = false;
    }
  }

  // Check 6: Spot-check critical corrected questions
  const spotChecks = [
    { id: 'mcq_829ba951066e293753c5', field: 'correct', expected: 'D', desc: 'hit the nail on the head' },
    { id: 'mcq_c54fc3ebddb9af5fdb35', field: 'correct', expected: 'C', desc: 'opposite of Distill' },
    { id: 'mcq_d279c841039e58735743', field: 'correct', expected: 'B', desc: 'falling off horse' },
    { id: 'mcq_f3850a68398c0864f204', field: 'correct', expected: 'D', desc: 'abide by rules' },
    { id: 'mcq_1ddee38296eb80494eb0', field: 'correct', expected: 'C', desc: 'the cat was run over (indirect past perfect)' },
    { id: 'mcq_049ba2b9b1f1e282931f', field: 'correct', expected: 'D', desc: 'Antonym of Sartorial' },
    { id: 'mcq_75a6100797cdbe7ad376', field: 'correct', expected: 'B', desc: 'quantity of milk' },
    { id: 'mcq_9839d0bc2f71805273a8', field: 'correct', expected: 'B', desc: 'bring me some water' },
    { id: 'mcq_6343f54d4861fbf03063', field: 'correct', expected: 'B', desc: 'hundreds of people' },
  ];

  console.log('\n6. Running Spot Checks on Fixed Questions:');
  for (const check of spotChecks) {
    const row = rows.find(r => r.id === check.id);
    if (!row) {
      errors.push(`Spot check failed: MCQ ${check.id} not found.`);
      passed = false;
    } else if (row[check.field] !== check.expected) {
      errors.push(`Spot check failed for ${check.id} (${check.desc}): expected ${check.field}=${check.expected}, got ${row[check.field]}`);
      passed = false;
    } else {
      console.log(`  ✓ ${check.id} (${check.desc}): ${check.field} = ${row[check.field]}`);
    }
  }

  console.log('\n=== Summary ===');
  if (passed) {
    console.log('✓ ALL 6 VERIFICATION CHECKS PASSED WITH ZERO ERRORS!\n');
  } else {
    console.error('❌ Verification failed with errors:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
}

runVerification();
