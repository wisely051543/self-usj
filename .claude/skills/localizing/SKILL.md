---
name: localizing
description: Translating this site — adding a language, naming a new USJ pass or attraction, or confirming an existing name against USJ's own pages. Covers the two string budgets, the term-table mechanics, and how to pull a canonical name out of usj.co.jp.
---

# Localizing

Two budgets, and they are not translated the same way.

- **Chrome** — the page's own wording. Lives in `STRINGS` in `index.html`, one table per locale. Adding a locale means writing every key; a missing key renders `undefined`, so the table is all-or-nothing.
- **Vendor strings** — USJ's wording: a pass's name, its display prefix (`eyebrow`), and the covered-attractions blurb (`legalDesc`). These arrive from the store API and are **not ours to write**. They go through `i18n/terms.<locale>.json`, keyed by the Japanese source.

The store API translates attraction names and nothing else. Asking it for a pass name in English returns the bare product code; asking for anything in Chinese returns `UnsupportedLanguageError`. So attraction names ride in the data (`attractionNames: {ja, en}`, fetched per language in `src/sources/usj.ts`), and everything else is hand-kept in the term tables.

## Every name is provisional until a USJ page confirms it

A literal translation from Japanese reads perfectly and is still wrong. `ミニオン・ハチャメチャ・ミッション ～大悪党への道～` renders naturally as 小小兵瘋狂**神偷**任務～**邁向**大壞蛋之路～; USJ calls it 小小兵瘋狂任務～**成為**大壞蛋之路～. Four of the first fourteen names checked were wrong this way, and none looked wrong.

So a name is **canonical** once a usj.co.jp page in that language shows it, and **provisional** until then. Both sets are named in the term file's `verified` field. Write the guess, then go confirm it.

## Steps

1. **Probe the upstream language first.** `curl 'https://comm-api.usj.co.jp/occ/v2/b2cportal/products/EXP0100?fields=FULL&lang=<code>&curr=JPY' -H 'x-anonymous-consents: %5B%5D'`. A rejected language means the whole locale is served from the term table; an accepted one means attraction names come free and belong in the data, not the table. Add accepted codes to `NAME_LANGS` in `src/sources/usj.ts`.

2. **Collect the Japanese that needs covering.** Walk `data/products/*.json` for the distinct `name`, `eyebrow`, `attractionNames` and `legalDesc` values, then subtract what the table already matches. What is left is the work.

3. **Write the entries.** Term-table mechanics below.

4. **Confirm each one against usj.co.jp.** Canonical-name recipe below. This is the bulk of the work and the whole point of it.

5. **Record the verdict.** Update the `verified` field in the term file: which names a page confirmed, which are still provisional and why. A name with no verdict is the one that silently ships wrong.

Done when every key in the file sits in one of the two sets and the `verified` field says which.

## Term-table mechanics

`term()` in `index.html` replaces every known key, **longest key first**, and leaves the rest in Japanese. Consequences worth writing entries around:

- **Short tokens are safe beside long names.** `ジョーズ` and `ジョーズ ～レッド・アラート～` can both be keys; the long one wins. This is what lets pass names be composed: `～トロッコ＆ジョーズ～` needs only `トロッコ` and `ジョーズ`, so a new pass built from known attractions translates itself.
- **Keys carry no ™.** The attraction name has a bare `™`, the blurb wraps it in `<sup>™</sup>`. A key without it matches both and the `™` rides along.
- **Values avoid `<` and `>`.** The blurb goes through `richText()` into `innerHTML`; a bare angle bracket is eaten as a tag. Use `＜＞` or drop them.
- **Partial coverage is the designed outcome.** An unmatched phrase stays Japanese, so a half-translated blurb still reads. Never invent an entry to avoid a gap.
- **The table outranks the API.** `rebuildTerms()` merges API names in only where the table is silent, which is how store-side typos (`ジュラシック・パーク・ザ・ライト`, `フォービ ドゥン`) get corrected.
- **Everything is folded to NFC first.** Some store strings arrive decomposed — `ジ` as `シ` plus a combining dakuten — which renders identically to the composed form and compares unequal. A whole product's blurb then misses every key while looking perfectly fine on screen. `nfc()` in `src/sources/usj.ts` normalises on write and `term()` normalises on read. When a key that plainly appears in the text does not fire, dump codepoints before doubting the key.

Run `npm run i18n:check` after any change to either. It replays the page's own replacement over every store string in `data/` and prints the Japanese that survived, tagged with the product and field to look at. Zero fragments is the bar; a new season's passes will break it.

## Pulling a canonical name out of usj.co.jp

The marketing site is an SPA — its HTML carries no names, and its search page renders nothing scrapeable. The content JSON behind it does:

```
https://www.usj.co.jp/contentdata/usj/<lang>/<region>/attractions/<slug>/index.html
```

`zh/tw`, `en/us`, `ja/jp`. The display name sits at `ComponentPresentations[].Component.Fields.heading.Values[0]` — take the first one whose value is in the target script. A 404 is served as an empty body; the SPA route returns 200 for everything, so probe `contentdata`, never `/web/`.

Slugs come from the API's English names, lowercased and hyphenated (`Hollywood Dream -The Ride: Backdrop` → `hollywood-dream-the-ride-backdrop`). Build the ja→en map by fetching each product twice:

```
https://comm-api.usj.co.jp/occ/v2/b2cportal/products/<CODE>?fields=FULL&lang=ja|en&curr=JPY
```

**When the detail page 404s, go up to the parent.** Area pages embed their children's names, so grepping one page's JSON for target-script strings yields every attraction in it at once — `areas/super-nintendo-world` gave 咚奇剛的瘋狂礦車™ and 超級任天堂世界™ after four slug guesses had all missed, and `areas/minion-park` gave the Minion pair the same way.

**When slug guessing runs out, search for the URL — never for the name.** A blog's translation is not canonical no matter how confident it sounds; a `usj.co.jp` URL is. So run `WebSearch` with `allowed_domains: ["usj.co.jp"]`, take the path it returns, and go read that path under `contentdata` as above. This is what finally produced the whole Halloween set: the event hub `events/halloween-extreme-autumn-2026/halloween-horror-nights` carries each attraction's Japanese title beside its translation, so one page settled six names at once. Seasonal names live under the current season's hub, so search the season, not the attraction.

USJ leaves some titles part-English on its own Chinese pages — 咒術迴戰 The Real 4-D, 鏈鋸人 The Chaos 4-D, 《Resident Evil Requiem》深淵絕境. Copy what the page says; normalising it into full Chinese un-does the verification.

An attraction whose page is not published for the season stays provisional. Say so in `verified` rather than guessing harder.
