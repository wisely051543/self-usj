/**
 * What the term tables do not cover yet.
 *
 * The store's wording changes with every season, and a term the tables miss
 * does not break the page — it renders in Japanese, which is by design. That is
 * exactly what makes the gap easy to never notice, so this prints it.
 *
 * Coverage is measured the way the page measures it: run the same longest-key
 * -first replacement over every store string, then look at what Japanese is
 * left. A string with no Japanese left is covered; anything else is reported
 * with the residue that survived, which is the phrase a new key should target.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Index, Localized, ProductResult } from './types';
import { assertIndexSchemaVersion } from './schema';

const ROOT = path.join(__dirname, '..');
const PRODUCTS_DIR = path.join(ROOT, 'data', 'products');
const I18N_DIR = path.join(ROOT, 'i18n');

/** Locales served from a term table. `ja` is the source; `en` gets attraction names from the API. */
const TABLE_LOCALES = ['zh-TW', 'en'];

/**
 * What counts as still-Japanese, per locale.
 *
 * Chinese is written in the same han range as Japanese, so for zh-TW only kana
 * can prove a fragment went untranslated — testing han there would report every
 * correct translation as a gap. It costs the rare all-kanji Japanese phrase,
 * which is a fair trade: USJ's boilerplate is full of kana, and an all-kanji
 * one reads the same in Chinese anyway.
 */
const UNTRANSLATED: Record<string, RegExp> = {
  'zh-TW': /[ぁ-んァ-ヶ]/,
  en: /[ぁ-んァ-ヶ一-龥]/,
};

const stripTm = (s: string) => s.replace(/™/g, '');

/** Matches the page: the store ships some strings decomposed, the tables are composed. */
const nfc = (s: string) => (s ?? '').normalize('NFC');

function readTerms(locale: string): Array<[string, string]> {
  const file = path.join(I18N_DIR, `terms.${locale}.json`);
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as { terms: Record<string, string> };
  return Object.entries(raw.terms);
}

/** The page's own substring pass, so this reports on what the page will render. */
function translate(text: string, index: Array<[string, string]>): string {
  let out = nfc(text);
  for (const [ja, target] of index) {
    if (out.includes(ja)) out = out.split(ja).join(target);
  }
  return out;
}

/**
 * Read a JSON file, naming what was being read when it goes wrong.
 *
 * Mirrors schema-check.ts's readSchemaVersion(): read and parse get their own
 * try/catch so "the file is not there" and "the file is there but corrupt"
 * stay two different sentences — a bare ENOENT or SyntaxError escaping from
 * here names neither the file nor which of the two happened. `subject` is the
 * repo-relative label the message leads with rather than the absolute path,
 * so a product file can also say which catalog entry sent us looking for it.
 *
 * Unlike fetcher.ts's readIndex(), an unreadable file is never a soft "cold
 * start" here: this file is a check, and a check that cannot read its input
 * has to go red rather than report zero gaps.
 */
function readJsonFile(file: string, subject: string): unknown {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch (err) {
    throw new Error(`${subject} could not be read: ${(err as Error).message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${subject} is not valid JSON: ${(err as Error).message}`);
  }
}

/**
 * Read data/index.json and refuse it before any caller can walk `.products`.
 *
 * Mirrors schema-check.ts's readSchemaVersion() -> assert*SchemaVersion()
 * pattern: this is the only place in this file that reads the index, so a
 * version mismatch surfaces here rather than downstream as an ENOENT on a
 * product file this file's caller expected but the version-correct catalog
 * would never have listed.
 */
export function readIndex(): Index {
  const file = path.join(ROOT, 'data', 'index.json');
  const index = readJsonFile(file, path.relative(ROOT, file)) as Index;
  assertIndexSchemaVersion(index.schemaVersion);
  return index;
}

// Exported only so the test file can call it directly; real invocation still
// goes through the `require.main === module` guard at the bottom of this file.
export function main(): void {
  const index = readIndex();
  // The subject names the product code as well as the path: the basename is
  // the code, but saying `product ABC` points straight at the index.json entry
  // that listed it, so nobody has to work backwards from a path. The path half
  // is derived from the path actually opened, never spelled out a second time,
  // so PRODUCTS_DIR moving can never leave the message naming a file that was
  // not the one read.
  const products = index.products.map(p => {
    const file = path.join(PRODUCTS_DIR, `${p.code}.json`);
    return readJsonFile(file, `product ${p.code} (${path.relative(ROOT, file)})`) as ProductResult;
  });

  // Every distinct store string the page puts through term(), tagged so a gap
  // report says which field to go look at.
  const sources = new Map<string, string>();
  for (const p of products) {
    // First writer wins, so the label names a product that really carries it.
    const note = (text: string, where: string) => {
      if (text && !sources.has(nfc(text))) sources.set(nfc(text), where);
    };
    note(p.name, `${p.code} name`);
    note(p.eyebrow, `${p.code} eyebrow`);
    note(p.legalDesc, `${p.code} legalDesc`);
    for (const [code, entry] of Object.entries(p.attractionNames ?? {})) {
      const name = nfc((entry as Localized)?.ja ?? '');
      if (name && !sources.has(name)) sources.set(name, `attraction ${code}`);
    }
  }

  let missingEn = 0;
  const seen = new Set<string>();
  for (const p of products) {
    for (const [code, entry] of Object.entries(p.attractionNames ?? {})) {
      if (seen.has(code)) continue;
      seen.add(code);
      if (!(entry as Localized)?.en) {
        console.log(`[en] attraction ${code} has no English name from the API: ${(entry as Localized)?.ja}`);
        missingEn++;
      }
    }
  }

  let gaps = 0;
  for (const locale of TABLE_LOCALES) {
    const table = new Map(readTerms(locale));

    // English attraction names come from the API, exactly as the page merges
    // them, so they must not be reported as table gaps.
    if (locale === 'en') {
      for (const p of products) {
        for (const entry of Object.values(p.attractionNames ?? {}) as Localized[]) {
          if (!entry?.en || !entry.ja) continue;
          const key = stripTm(nfc(entry.ja));
          if (!table.has(key)) table.set(key, stripTm(entry.en));
        }
      }
    }

    const ordered = [...table].sort((a, b) => b[0].length - a[0].length);
    const residues = new Map<string, string>();
    const untranslated = UNTRANSLATED[locale];

    for (const [text, where] of sources) {
      const left = translate(text, ordered)
        .replace(/<[^>]*>/g, ' ')     // markup is not untranslated text
        .replace(/&[a-z]+;/g, ' ');
      for (const chunk of left.split(/[\s|｜、,，。/]+/)) {
        const piece = chunk.trim();
        if (piece && untranslated.test(piece) && !residues.has(piece)) residues.set(piece, where);
      }
    }

    console.log(`\n[${locale}] ${table.size} terms, ${residues.size} untranslated fragment(s)`);
    for (const [piece, where] of [...residues].sort((a, b) => b[0].length - a[0].length)) {
      console.log(`  ${piece}   (${where})`);
    }
    gaps += residues.size;
  }

  console.log(`\n${gaps} gap(s), ${missingEn} attraction(s) without an English name.`);
}

if (require.main === module) { main(); }
