import fs from 'fs';
import path from 'path';
import { Database } from 'bun:sqlite';

const SQLITE_PATH = './.wrangler/state/v3/d1/miniflare-D1DatabaseObject/162b09b8c67e3fafda77330427d4549c676383a88b8302c1c67b4028ca2ddb1e.sqlite';

const ENGLISH_FILES = [
  'ppsc-past-papers-mcqs-2004-to-2020-of-english.json',
  'ppsc-past-papers-all-mcqs-2021-of-english.json',
  'ppsc-past-papers-all-mcqs-2022-of-english.json',
  'ppsc-past-papers-all-mcqs-2023-of-english.json',
  'ppsc-past-papers-all-mcqs-2024-of-english.json',
  'ppsc-past-papers-all-mcqs-2025-of-english.json',
  'ppsc-past-papers-english-mcqs-2026.json',
];

const ENGLISH_SUBTOPICS = [
  'ppsc_ee8a90a2b58e70e5',
  'ppsc_384c271fa41997c3',
  'ppsc_2ebcf5b7f8fe9306',
  'ppsc_d723f1b7075eee65',
  'ppsc_741c41c4d40c5ee0',
  'ppsc_5cf1bccc2fa112eb',
  'ppsc_c877e3a404b219fc',
];

// Exact ID correction overrides for wrong answer keys, missing keys, and option deduplications
const EXACT_ID_CORRECTIONS: Record<string, {
  question?: string;
  options?: Record<string, string>;
  correct?: string;
  explanation?: string | null;
}> = {
  // 1. Missing answer keys
  'mcq_829ba951066e293753c5': {
    question: 'What does the idiom "hit the nail right on the head" mean?',
    correct: 'D',
  },
  'mcq_c54fc3ebddb9af5fdb35': {
    question: "The opposite of 'Distill' is:",
    correct: 'C',
  },
  'mcq_d279c841039e58735743': {
    question: 'Emily is falling _____ the horse.',
    options: { A: 'In', B: 'Off', C: 'Onto', D: 'Inside' },
    correct: 'B',
  },
  'mcq_f3850a68398c0864f204': {
    question: 'We should abide ______ the rules of the institution.',
    options: { A: 'From', B: 'On', C: 'With', D: 'By' },
    correct: 'D',
  },
  'mcq_ec2aa4a9fe667381c236': {
    question: 'The idiom "To smell a rat" means:',
    options: {
      A: 'To detect something wrong',
      B: 'To suspect a trick or deceit',
      C: 'To suspect that something is wrong',
      D: 'To suspect foul dealings',
    },
    correct: 'D',
  },
  'mcq_cf8f4049594026bbdbaa': {
    question: 'Nyctophobia is the fear of:',
    options: { A: 'Birds', B: 'Animals', C: 'Height', D: 'Darkness' },
    correct: 'D',
  },

  // 2. Grammatically wrong answer keys & option defects
  'mcq_1ddee38296eb80494eb0': {
    question: 'Direct speech: "The cat was run over by the truck." Convert to indirect speech:',
    options: {
      A: 'He said the cat is run over by the truck.',
      B: 'He said the cat was being run over by the truck.',
      C: 'He said the cat had been run over by the truck.',
      D: 'He said the cat was run over by the truck.',
    },
    correct: 'C',
  },
  'mcq_0ea5f67494e91054e066': {
    question: 'Change into passive voice: He asked me if I could drive a car.',
    options: {
      A: 'I was asked if I could drive a car.',
      B: 'I was requested if I could drive a car.',
      C: 'I was told if I could drive a car.',
      D: 'None of these',
    },
    correct: 'A',
  },
  'mcq_049ba2b9b1f1e282931f': {
    question: 'The Antonym of "Sartorial" is:',
    options: {
      A: 'Stylish',
      B: 'Sincere',
      C: 'Elegant',
      D: 'Homespun',
    },
    correct: 'D',
  },
  'mcq_0cc34fefd7495b5b030d': {
    question: 'Change into indirect speech: "Who is helping you?"',
    options: {
      A: 'He asked who is helping me.',
      B: 'He asked who was helping me.',
      C: 'He asked who had helped me.',
      D: 'None of these',
    },
    correct: 'B',
  },
  'mcq_162b7ddbb448288ae572': {
    question: 'Change the voice: Let us play nicely here.',
    options: {
      A: 'It is suggested that we should play nicely here.',
      B: 'Let it be nicely played here.',
      C: 'We should be played nicely here.',
      D: 'None of these',
    },
    correct: 'A',
  },
  'mcq_88545ff3036630a385e5': {
    question: 'Change the voice: "Our army has defeated the enemy."',
    options: {
      A: 'The enemy was defeated by our army.',
      B: 'The enemy has been defeated by our army.',
      C: 'The enemy had been defeated by our army.',
      D: 'None of these',
    },
    correct: 'B',
  },
  'mcq_cac8bb2ff1f526cec29a': {
    question: 'Change the voice: I had hoped that they would fix my locker while I was away, but they didn’t.',
    options: {
      A: "I had hoped that my locker would be fixed while I was away, but it wasn't.",
      B: "I had hoped that my locker will be fixed while I was away, but it wasn't.",
      C: "I hoped that my locker would be fixed while I was away, but it wasn't.",
      D: 'None of these',
    },
    correct: 'A',
  },
  'mcq_cc91858c0036274c0381': {
    question: 'He was admitted _____ the college.',
    options: { A: 'In', B: 'To', C: 'Into', D: 'At' },
    correct: 'B',
  },
  'mcq_f163a573429219ea6af9': {
    question: 'The Antonym of "Subsequent" is:',
    options: { A: 'Following', B: 'Succeeding', C: 'Anterior', D: 'Prior' },
    correct: 'D',
  },
  'mcq_a50eaf3c4a1c2aeeffc4': {
    question: 'She behaves as if she _______ everything.',
    options: { A: 'Knows', B: 'Knew', C: 'Knowing', D: 'Has known' },
    correct: 'B',
  },
  'mcq_475c1454c9c960f9b06f': {
    question: 'My house is much larger than _____.',
    options: { A: "You's", B: "Your's", C: 'Yours', D: 'Your' },
    correct: 'C',
  },
  'mcq_3282e8931aa9e68ed2d5': {
    question: 'Find the correct spelling:',
    options: { A: 'Existence', B: 'Existense', C: 'Existance', D: 'None of these' },
    correct: 'A',
  },
  'mcq_40046eb88c42bf022374': {
    question: 'Choose the correct punctuation:',
    options: {
      A: 'He asked, "Where are you going?"',
      B: 'He asked "Where are you going?"',
      C: 'He asked, Where are you going?',
      D: 'None of these',
    },
    correct: 'A',
  },
  'mcq_51087a9bb894ec70a60c': {
    question: 'The Synonym of Antipathy is:',
    options: { A: 'Love', B: 'Goodwill', C: 'Enmity', D: 'Affection' },
    correct: 'C',
  },
  'mcq_578d6ef3c46462482226': {
    question: 'What is the Synonym of Concord?',
    options: { A: 'Variance', B: 'Agreement', C: 'Discord', D: 'Conflict' },
    correct: 'B',
  },
  'mcq_5c27db629dd36d6571d8': {
    question: 'Choose the sentence with correct capitalization:',
    options: {
      A: 'Mr. Smith is our English teacher.',
      B: 'Mr. Smith is our english teacher.',
      C: 'Mr. Smith is our English Teacher.',
      D: 'None of these',
    },
    correct: 'A',
  },
  'mcq_6343f54d4861fbf03063': {
    question: 'Choose the correct sentence:',
    options: {
      A: 'Hundred of people are watching the match on TV',
      B: 'Hundreds of people are watching the match on TV',
      C: 'Many hundred of people are watching the match on TV',
      D: 'None of these',
    },
    correct: 'B',
  },
  'mcq_75a6100797cdbe7ad376': {
    question: 'He gave me a _____ quantity of milk.',
    options: { A: 'small', B: 'little', C: 'tiny', D: 'None of these' },
    correct: 'B',
  },
  'mcq_9839d0bc2f71805273a8': {
    question: 'Bring me _______ water.',
    options: { A: 'Little', B: 'Some', C: 'Few', D: 'None of these' },
    correct: 'B',
  },
  'mcq_ad443f9d366818a1e4f0': {
    question: '______ of what he said was very sensible.',
    options: { A: 'Few', B: 'Much', C: 'Many', D: 'Little' },
    correct: 'B',
  },
  'mcq_a6496fb2716cf9693dab': {
    question: 'Choose the correct indirect speech:',
    options: {
      A: 'A mother told her son that do not play in the sunshine and sit under the tree shade.',
      B: 'A mother told her son not to play in the sunshine and to sit under the tree shade.',
      C: 'A mother told her son to not play in the sunshine and to sit under the tree shade.',
      D: 'A mother said her son don’t play in the sunshine and sit under the tree shade.',
    },
    correct: 'B',
  },
  'mcq_4503b341b9a7899315b2': {
    question: 'Choose the correct sentence:',
    options: {
      A: 'Everything is good in menu',
      B: 'Everything is good on the menu',
      C: 'Everything is good at menu',
      D: 'Everything good is menu',
    },
    correct: 'B',
  },
  'mcq_7a05f1d1852c06ee6423': {
    question: 'Identify the correct spelling:',
    options: { A: 'Prety', B: 'Pretty', C: 'Prettey', D: 'Prity' },
    correct: 'B',
  },
  'mcq_fb5e7d735b03e9b05673': {
    question: 'Select the correctly spelt word:',
    options: { A: 'Coaltion', B: 'Coallition', C: 'Coalition', D: 'Colition' },
    correct: 'C',
  },
  'mcq_cafcc1dba5d76f43663b': {
    question: 'Which word is wrongly spelt in the following set of words?',
    options: { A: 'Hight', B: 'Light', C: 'Might', D: 'Sight' },
    correct: 'A',
  },
  'mcq_f7647b3007804a0cbeb0': {
    question: 'Which word is wrongly spelt in the following set of words?',
    options: { A: 'Hight', B: 'Light', C: 'Might', D: 'Sight' },
    correct: 'A',
  },
  'mcq_7dd9b6e3bba308a20dcb': {
    question: 'Identify the past perfect sentence:',
    options: {
      A: 'She has laugh.',
      B: 'She had laughed.',
      C: 'She has laughing.',
      D: 'None of these',
    },
    correct: 'B',
  },
  'mcq_13beee6eae5f3040a7bc': {
    question: 'Choose the correct sentence:',
    options: {
      A: 'He has died a year ago.',
      B: 'He died a year ago.',
      C: 'He had died a year ago.',
      D: 'He is died a year ago.',
    },
    correct: 'B',
  },
  'mcq_91d07a665c2e342bedc3': {
    question: 'Choose the correct sentence:',
    options: {
      A: 'Let you and I go together',
      B: 'Let you and me go together',
      C: 'Let I and you go together',
      D: 'Let me and you go together',
    },
    correct: 'B',
  },
  'mcq_ffada2e0bba670d12960': {
    question: 'Which word is wrongly spelt in the following set of words?',
    options: { A: 'Confusion', B: 'Previous', C: 'Computer', D: 'Distruction' },
    correct: 'D',
  },
  'mcq_5b501a1b0aa34f580c18': {
    question: 'Which word is wrongly spelt in the following set of words?',
    options: { A: 'Enquiry', B: 'Electricity', C: 'Nursary', D: 'Library' },
    correct: 'C',
  },
  'mcq_4e90f04b3b4c4674532a': {
    question: 'Find the word that is different from the other three:',
    options: { A: 'Lion', B: 'Elephant', C: 'Tiger', D: 'Leopard' },
    correct: 'B',
  },
  'mcq_dd20018c914a2650949e': {
    question: 'Find the word that is different from the other three:',
    options: { A: 'Apples', B: 'Oranges', C: 'Mango', D: 'Spinach' },
    correct: 'D',
  },
  'mcq_fa96af6d83bbdbf8f09d': {
    question: 'Find the word that is different from the other three:',
    options: { A: 'Barometer', B: 'Thermometer', C: 'Diameter', D: 'Lactometer' },
    correct: 'C',
  },
  'mcq_f483b87d7edf90d4402f': {
    question: 'Choose the correct sentence from the following:',
    options: {
      A: 'I requested her to kindly help me',
      B: 'I requested her to help me kindly',
      C: 'I kindly requested her to help me',
      D: 'I requested her kindly to help me',
    },
    correct: 'B',
  },
  'mcq_cf07ffc10b41e80df841': {
    question: 'Choose the correct sentence:',
    options: {
      A: 'Faisalabad is as famous city as Lahore',
      B: 'Faisalabad is famous city as Lahore',
      C: 'Faisalabad is the famous city as Lahore',
      D: 'Faisalabad is as famous a city as Lahore',
    },
    correct: 'D',
  },
  'mcq_3803bc26d481a33818b2': {
    question: 'Which word is wrongly spelt in the following set of words?',
    options: { A: 'Beginning', B: 'Appearence', C: 'Ceiling', D: 'Changeable' },
    correct: 'B',
  },
  'mcq_c1598f31490da2569991': {
    question: 'Choose the correct sentence:',
    options: {
      A: 'He was promoted as DSP',
      B: 'He was promoted to DSP',
      C: 'He was promoted DSP',
      D: 'None of these',
    },
    correct: 'B',
  },
  'mcq_020ffc942c85d2c987aa': {
    question: 'Choose the correct sentence:',
    options: {
      A: 'This is most perfect.',
      B: 'This is perfect.',
      C: 'This is a most perfect.',
      D: 'None of these',
    },
    correct: 'B',
  },
  'mcq_0428dc80a27e1faa83c9': {
    question: 'Which one of the following words is not a preposition?',
    options: { A: 'Against', B: 'Away', C: 'Like', D: 'None of these' },
    correct: 'B',
  },
  'mcq_072378a6804f4fc4fcde': {
    question: 'Choose the correct spelling:',
    options: { A: 'Sucecde', B: 'Succeed', C: 'Sueecde', D: 'Sucedetes' },
    correct: 'B',
  },
  'mcq_089b1f5909d0de75f675': {
    question: 'Which word is wrongly spelt in the following set of words?',
    options: { A: 'Speach', B: 'Speak', C: 'Break', D: 'Bleed' },
    correct: 'A',
  },
  'mcq_09cf85a4775713e7e154': {
    question: 'Choose the correct sentence:',
    options: {
      A: 'Both sisters is in same class.',
      B: 'Both sisters are in the same class.',
      C: 'The both sisters are in same class.',
      D: 'None of these',
    },
    correct: 'B',
  },
  'mcq_0a3c696fbcb7377f065f': {
    question: 'Select the correct spelling:',
    options: { A: 'Victory', B: 'Victery', C: 'Victary', D: 'Victon' },
    correct: 'A',
  },
  'mcq_0ffb0ef18649f9ebb891': {
    question: 'Choose the correctly spelt word:',
    options: { A: 'Commettee', B: 'Commitee', C: 'Committe', D: 'Committee' },
    correct: 'D',
  },
  'mcq_1040a38ab220af4b8fd1': {
    question: 'The correct spelling is:',
    options: { A: 'Ghandhara', B: 'Gandara', C: 'Gandhara', D: 'Ghandara' },
    correct: 'C',
  },
  'mcq_186b16e3e9760388a152': {
    question: 'Choose the correct spelling:',
    options: { A: 'Pevot', B: 'Pivot', C: 'Piviet', D: 'None of these' },
    correct: 'B',
  },
  'mcq_21a80b477c1898c9608f': {
    question: 'Find the correct spelling:',
    options: { A: 'Cuming', B: 'Comming', C: 'Comeing', D: 'Coming' },
    correct: 'D',
  },
  'mcq_224cc58d0a872a02a26a': {
    question: 'Which word is wrongly spelt in the following set of words?',
    options: { A: 'Tournament', B: 'Refreshment', C: 'Goverment', D: 'Ornament' },
    correct: 'C',
  },
  'mcq_243e866c93af73c7f436': {
    question: 'Choose the correct spelling:',
    options: { A: 'Imidiatly', B: 'Immidiatly', C: 'Imidiately', D: 'Immediately' },
    correct: 'D',
  },
  'mcq_2686d1c1804d828f437f': {
    question: 'Choose the incorrect spelling:',
    options: { A: 'Transpyre', B: 'Rejuvenation', C: 'Reverberation', D: 'Hallucinations' },
    correct: 'A',
  },
  'mcq_2788647c8af15357c684': {
    question: 'Choose the correct spelling:',
    options: { A: 'Diverse', B: 'Diverce', C: 'Diwerse', D: 'None of these' },
    correct: 'A',
  },
  'mcq_28ca29abf8429491fe49': {
    question: 'Choose the correct spelling:',
    options: { A: 'Continuous', B: 'Continous', C: 'Continuoas', D: 'None of these' },
    correct: 'A',
  },
  'mcq_2c1679239f657189dadc': {
    question: 'Identify the correct spelling:',
    options: { A: 'Occured', B: 'Occurred', C: 'Occurrred', D: 'Occurad' },
    correct: 'B',
  },
  'mcq_3018ec557f62acb637a0': {
    question: 'Find the correct spelling:',
    options: { A: 'Convenent', B: 'Convinient', C: 'Convenient', D: 'Convenant' },
    correct: 'C',
  },
  'mcq_30360f38eb81009de066': {
    question: 'Which word is wrongly spelt in the following set of words?',
    options: { A: 'Priveous', B: 'Companion', C: 'Confusion', D: 'Gratitude' },
    correct: 'A',
  },
  'mcq_3153823369bedb00bcd2': {
    question: 'Which of the following has incorrect spellings?',
    options: { A: 'Electrecity', B: 'Enquiry', C: 'Operational', D: 'Probation' },
    correct: 'A',
  },
};

// General stem sanitization logic
function sanitizeQuestionStem(q: string, opts?: Record<string, string>): string {
  let cleaned = q.trim();

  // Strip leading numbering like "1. ", "25. "
  cleaned = cleaned.replace(/^\d+\.\s*/, '');

  // Fix known merged prefixes
  if (/^Identifythe/i.test(cleaned)) {
    cleaned = cleaned.replace(/^Identifythe/i, 'Identify the');
  }

  // 1. Check for embedded choices pattern like (A)... (B)... or A)... B)...
  if (/(?:\([A-D]\)|^[A-D]\)|(?:\s+|^)[A-D]\))\s+/.test(cleaned)) {
    if (/which word is wrongly spelt|incorrect.*spell|misspelt/i.test(cleaned)) {
      return 'Which word is wrongly spelt in the following set of words?';
    }
    if (/find.*one word.*different|which is different/i.test(cleaned)) {
      return 'Find the word that is different from the other three:';
    }
    if (/choose.*correct.*spelling|identify.*correct.*spelling|select.*correct.*word/i.test(cleaned)) {
      return 'Choose the correct spelling:';
    }
    if (/choose.*correct.*indirect|indirect.*speech/i.test(cleaned)) {
      return 'Choose the correct indirect speech:';
    }
    if (/choose.*correct.*sentence|identify.*sentence/i.test(cleaned)) {
      return 'Choose the correct sentence:';
    }
    if (/identify.*past perfect/i.test(cleaned)) {
      return 'Identify the past perfect sentence:';
    }
    if (/change into indirect/i.test(cleaned)) {
      return 'Change into indirect speech:';
    }
  }

  // 2. Spelling questions with concatenated words
  if (/(?:choose|select|identify|find)\s+(?:the\s+)?(?:correct|wrongly|incorrect|correctly)\s+(?:spelling|spelt|spellings?|word)[^:]*:\s*/i.test(cleaned)) {
    if (/wrongly|incorrect/i.test(cleaned)) {
      return 'Which word is wrongly spelt in the following set of words?';
    } else {
      return 'Choose the correct spelling:';
    }
  }

  // 3. Trailing options list in stem
  if (opts) {
    const vals = Object.values(opts).filter(v => typeof v === 'string' && v.trim().length > 1);
    const colonIdx = cleaned.indexOf(':');
    const qmarkIdx = cleaned.indexOf('?');
    const splitIdx = colonIdx !== -1 ? colonIdx : qmarkIdx;
    if (splitIdx > 8 && splitIdx < cleaned.length - 8) {
      const tail = cleaned.substring(splitIdx + 1);
      const matchCount = vals.filter(v => tail.toLowerCase().includes(v.toLowerCase())).length;
      if (matchCount >= 2) {
        cleaned = cleaned.substring(0, splitIdx + 1).trim();
      }
    }
  }

  return cleaned;
}

// Clean option values (trim whitespace, remove unwanted prefixes)
function sanitizeOptions(opts: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts)) {
    if (typeof v === 'string') {
      let cleanVal = v.trim();
      // Remove accidental option prefixes like "A) ", "B. "
      cleanVal = cleanVal.replace(/^[A-E][).:\s]\s*/, '').trim();
      result[k] = cleanVal;
    } else {
      result[k] = v;
    }
  }
  return result;
}

async function run() {
  console.log('=== Starting English MCQs Quality & Correctness Pipeline ===\n');

  const db = new Database(SQLITE_PATH);

  // 1. Process local SQLite DB
  console.log('Step 1: Auditing & Updating local SQLite database...');
  const mcqs = db.query(`SELECT id, subject_id, question, options, correct, explanation FROM mcq WHERE subject_id IN ('${ENGLISH_SUBTOPICS.join("','")}') ORDER BY id`).all() as any[];

  console.log(`Found ${mcqs.length} English MCQs in SQLite database.`);

  let dbUpdatedCount = 0;
  let exactOverridesCount = 0;
  let stemCleanedCount = 0;

  const updateStmt = db.prepare('UPDATE mcq SET question = ?, options = ?, correct = ?, explanation = ? WHERE id = ?');

  db.exec('BEGIN TRANSACTION');
  try {
    for (const row of mcqs) {
      const id = row.id;
      let q = row.question;
      let opts = JSON.parse(row.options);
      let correct = row.correct;
      let explanation = row.explanation;
      let changed = false;

      // Apply exact overrides first if any
      if (EXACT_ID_CORRECTIONS[id]) {
        const override = EXACT_ID_CORRECTIONS[id];
        if (override.question) q = override.question;
        if (override.options) opts = override.options;
        if (override.correct !== undefined) correct = override.correct;
        if (override.explanation !== undefined) explanation = override.explanation;
        changed = true;
        exactOverridesCount++;
      }

      // Sanitize question stem
      const sanitizedQ = sanitizeQuestionStem(q, opts);
      if (sanitizedQ !== q) {
        q = sanitizedQ;
        changed = true;
        stemCleanedCount++;
      }

      // Sanitize options
      const sanitizedOpts = sanitizeOptions(opts);
      if (JSON.stringify(sanitizedOpts) !== JSON.stringify(opts)) {
        opts = sanitizedOpts;
        changed = true;
      }

      if (changed) {
        updateStmt.run(q, JSON.stringify(opts), correct, explanation, id);
        dbUpdatedCount++;
      }
    }
    db.exec('COMMIT');
    console.log(`✓ SQLite database updated: ${dbUpdatedCount} MCQs modified (${exactOverridesCount} exact overrides, ${stemCleanedCount} stem sanitizations).`);
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Error updating SQLite database:', err);
    throw err;
  }

  // 2. Process JSON source files in data/ppsc/
  console.log('\nStep 2: Auditing & Updating raw JSON source files in data/ppsc/...');
  let totalJsonModified = 0;

  for (const fileName of ENGLISH_FILES) {
    const filePath = path.join('./data/ppsc', fileName);
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      continue;
    }

    const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let fileModifiedCount = 0;

    for (const item of fileContent.mcqs) {
      let q = item.question;
      let opts = item.options;
      let correct = item.correct;
      let changed = false;

      // Stem sanitization
      const sanitizedQ = sanitizeQuestionStem(q, opts);
      if (sanitizedQ !== q) {
        item.question = sanitizedQ;
        changed = true;
      }

      // Options sanitization
      const sanitizedOpts = sanitizeOptions(opts);
      if (JSON.stringify(sanitizedOpts) !== JSON.stringify(opts)) {
        item.options = sanitizedOpts;
        changed = true;
      }

      // Missing keys resolution in JSON
      if (!item.correct || !['A', 'B', 'C', 'D', 'E'].includes(item.correct)) {
        if (/hit the nail/i.test(q)) { item.correct = 'D'; changed = true; }
        else if (/opposite of 'distill'/i.test(q)) { item.correct = 'C'; changed = true; }
        else if (/falling.*horse/i.test(q)) {
          item.options = { A: 'In', B: 'Off', C: 'Onto', D: 'Inside' };
          item.correct = 'B';
          changed = true;
        }
        else if (/abide.*rules/i.test(q)) {
          item.options = { A: 'From', B: 'On', C: 'With', D: 'By' };
          item.correct = 'D';
          changed = true;
        }
        else if (/smell a rat/i.test(q)) { item.correct = 'D'; changed = true; }
        else if (/nyctophobia/i.test(q)) {
          item.options = { A: 'Birds', B: 'Animals', C: 'Height', D: 'Darkness' };
          item.correct = 'D';
          changed = true;
        }
      }

      // Apply specific wrong answer key corrections in JSON
      if (/the cat was run over by the truck/i.test(q)) {
        item.correct = 'C';
        changed = true;
      }
      if (/synonym of sartorial/i.test(q)) {
        item.question = 'The Antonym of "Sartorial" is:';
        item.options = { A: 'Stylish', B: 'Sincere', C: 'Elegant', D: 'Homespun' };
        item.correct = 'D';
        changed = true;
      }

      if (changed) {
        fileModifiedCount++;
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2), 'utf8');
    console.log(`✓ ${fileName}: ${fileModifiedCount} MCQs updated.`);
    totalJsonModified += fileModifiedCount;
  }

  console.log(`\n✓ Total JSON MCQs modified: ${totalJsonModified}`);
  console.log('\n=== English MCQs Quality Pipeline Complete ===\n');
}

run().catch(console.error);
