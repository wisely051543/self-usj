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

function main(): void {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'), 'utf-8')) as Index;
  const products = index.products.map(
    p => JSON.parse(fs.readFileSync(path.join(PRODUCTS_DIR, `${p.code}.json`), 'utf-8')) as ProductResult,
  );

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

main();
