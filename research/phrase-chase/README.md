# Phrase-chase — reverse-engineering stealthwriter

**Goal:** Extract the phrase-level transformations stealthwriter applies that defeat Copyleaks. Build a dictionary of replacements. Codify into a post-clean pass in Veil.

**Why phrases not structure:** Three failed attempts proved Copyleaks reads phrase-level n-grams, not sentence shape (see `~/claude-brain/02-dead-ends/copyleaks-fingerprint-ceiling.md` and `copyleaks-burstiness-injection.md`). One stealthwriter output beat Copyleaks at 0% AI — confirms vocabulary attack is the right axis.

## Source A/B pairs

Each pair is: AI input → stealthwriter output (Level 8, Ghost Mini, free tier). Copyleaks score noted when verified.

### Pair 01 — ADAPT financial system (2026-05-13)

**Verified:** Copyleaks scored output at **0% AI / 100% Human / "No AI Content Found"**

**AI input:**
```
Figure 1 shows how ADAPT would operate in a real financial institution. The system receives live transaction data and processes it through cleaning, normalization, and feature engineering before applying anomaly detection techniques. The Isolation Forest layer identifies unusual behavior at the individual customer level, while the graph-based layer detects suspicious relationships between accounts and transactions. The final fraud risk score determines whether a transaction is approved,
```

**Stealthwriter output:**
```
As seen in Figure 1, the ADAPT would work in a real financial institution. The system accepts live transaction data and cleans, normalizes and feature engineers the data, then it applies some techniques for anomaly detection. The two layers are the Isolation Forest layer for detecting anomalies at the individual customer level, and the graph-based layer for detecting suspicious relationships between accounts and transactions. The final fraud risk score is used to approve or reject transactions,
```

**Diff analysis:**

| AI phrasing | Stealthwriter phrasing | Pattern |
|---|---|---|
| "Figure 1 shows how" | "As seen in Figure 1," | Opener reframe — direct verb → passive reference |
| "would operate" | "would work" | Register downgrade — formal verb → plain verb |
| "receives" | "accepts" | Synonym swap to commoner verb |
| "processes it through cleaning, normalization, and feature engineering" | "cleans, normalizes and feature engineers the data" | Verbal gerund chain → active verb chain (loses "the data", adds it back as object) |
| "before applying anomaly detection techniques" | "then it applies some techniques for anomaly detection" | Subordinate clause → coordinate "then" clause + hedge "some" + reordered "techniques for X" |
| "identifies unusual behavior" | "for detecting anomalies" | Active "identifies X" → infinitive "for detecting Y" + synonym |
| "while the graph-based layer detects" | "and the graph-based layer for detecting" | Subordinate "while" → coordinate "and" + infinitive |
| "determines whether a transaction is approved" | "is used to approve or reject transactions" | Indirect "determines whether X" → direct "is used to do X or Y" + add explicit opposite |

**Extracted patterns (Pair 01):**

1. **Hedge insertion** — "applying X techniques" → "applying some techniques for X". Adds vagueness LLMs avoid.
2. **Subordinate → coordinate clause** — "while" → "and"; "before X-ing" → "then it X-s".
3. **Active verb → infinitive phrase** — "X detects Y" → "X for detecting Y". Awkward but human.
4. **Gerund noun chain → verb chain** — "through cleaning, normalization, and feature engineering" → "cleans, normalizes and feature engineers" (uses noun as verb informally).
5. **Register downgrade** — "operate" → "work", "receives" → "accepts".
6. **Opener reframe** — "X shows how Y" → "As seen in X, Y".
7. **Indirect → direct with explicit pair** — "determines whether approved" → "approve or reject".

## Next pairs needed

To build a real dict, need 4-5 more A/B pairs across categories. When user generates more:

- Pair 02: Academic essay
- Pair 03: Business / marketing copy
- Pair 04: Casual / opinion blog
- Pair 05: Product description

Pre-loaded inputs ready in `research/ai-test-corpus/01-academic-essay.txt` etc. Paste each into stealthwriter at Level 8 / Ghost Mini, save the output here.

## Filing convention

Save new A/B pairs under `research/phrase-chase/pair-NN-shortname/`:
- `input.txt` — original AI text
- `output.txt` — stealthwriter humanized
- `notes.md` — diff analysis + extracted patterns

## Dictionary scaffold — built 2026-05-13 22:50

`lib/humanizer-phrase-dict.ts` now exists. 82 swap rules seeded from Pairs 01–06: 27 idioms, 41 vocab, 14 transitions.

**Gating:** opt-in via `HUMANIZER_PHRASE_DICT=on`. Default off. Same pattern as `HUMANIZER_BURSTINESS`.

**Two design rules baked in:**
1. Never swap toward a word already on `humanizer.ts` `GENERIC_PATTERNS` banned list. (Stealthwriter sometimes does this — e.g. `Furthermore → Moreover` — but Moreover is itself flagged.)
2. Longer multi-word idioms run before single-word swaps so the idiom wins.

**Post-pass fixes:**
- `a/an` article agreement after vowel-shifting swaps (`a comprehensive` → `an overall`).
- Sentence recapitalization after dropping leading phrases (`We believe that quality matters` → `Quality matters`).

**Measurement (from `npm run research:phrase-dict`):**

| Pair | Swaps | Idioms | Vocab | Transitions |
|---|---:|---:|---:|---:|
| pair-01-adapt-financial | 0 | 0 | 0 | 0 |
| pair-02-academic-essay | 20 | 8 | 9 | 3 |
| pair-03-business-copy | 10 | 3 | 7 | 0 |
| pair-04-tech-explainer | 14 | 1 | 11 | 2 |
| pair-05-casual-blog | 17 | 6 | 9 | 2 |
| pair-06-product-description | 11 | 1 | 9 | 1 |

Pair 01 produces zero swaps — its stealthwriter transforms are entirely structural (subordinate→coordinate, opener reframe, de-nominalization) which we deliberately didn't codify. The dict is a *vocabulary* layer; structural transforms remain unaddressed.

**npm scripts:**
- `npm run test:phrase-dict` — unit tests (20 passing)
- `npm run research:phrase-dict` — swap counts across all pairs

**Validation status: UNVERIFIED.** Only Pair 01 was Copyleaks-tested at 0% AI, and the dict produces no changes on Pair 01. The 71 swaps on Pairs 02–06 have not been Copyleaks-validated. The dict is plausibly useful but not proven. Before turning on by default:
1. Run one dict-transformed output (e.g. Pair 04 with 14 swaps) through Copyleaks.
2. If <60% AI: stack with burstiness and try defaulting on.
3. If still 100% AI: lexical layer alone is insufficient; need structural transforms.

## Structural transforms — built 2026-05-13 23:10 (v2)

`lib/humanizer-structural.ts` adds six clause-level rewrites observed in Pair 01:

| Rule | Example |
|---|---|
| `figureReframe` | `Figure 1 shows how X` → `As seen in Figure 1, X` |
| `whileToAnd` | `..., while the layer detects ...` → `..., and the layer detects ...` |
| `itIsCrucialDrop` | `It is crucial that X` → `It's essential that X` (dict then swaps essential→important) |
| `itIsEssentialDrop` | `It is essential to recognize that X` → `It's important to understand that X` |
| `litotesCollapse` | `is not without its X` → `has its X` |
| `inTodaysReframe` | `In today's evolving digital landscape, [long clause]` → `[long clause] in today's evolving digital landscape` |

Gated by `HUMANIZER_STRUCTURAL=on`. 10 unit tests passing.

Pair 01's stealthwriter output also used transforms we deliberately did NOT codify because regex can't safely produce them:
- Gerund chain → verb chain (`through cleaning, normalization, ...` → `cleans, normalizes, ...`)
- Active verb → infinitive (`X detects Y` → `X for detecting Y`)
- Hedge insertion (`applying X techniques` → `applying some techniques for X`)

These need parsing-level work. Consider for v3.

## CLI harness

`scripts/humanize-cli.mjs` — paste text in, get transformed text out:

```sh
echo "text..." | npm run humanize
node scripts/humanize-cli.mjs --file in.txt --report
node scripts/humanize-cli.mjs --file in.txt --only-dict
```

Three transforms compose: structural → dict → burstiness. Stack is verified idempotent.

## Pre-generated outputs

`npm run phrase-chase:generate` writes `pair-NN/transformed/{dict-only,structural-only,dict-plus-structural,all-three}.txt` for every pair. See `VALIDATION.md` for the recommended 1-2 credit Copyleaks check.

## Source-style anchoring — built 2026-05-14 (v3)

**FIRST COPYLEAKS PASS.** Hybrid casual-forum style anchor on Pair 04: **"All Clear — Nothing Flagged"** (Copyleaks, 2026-05-14).

### Why it works

Four prior approaches failed because they modified AI text post-hoc (word swaps, sentence restructuring) without changing the underlying statistical distribution. Copyleaks detects the model's fingerprint at a deeper level than vocabulary.

Source-style anchoring changes the approach entirely: instead of patching AI text, we give the LLM a **real human writing sample** (the "anchor") and tell it to rewrite the AI text in that voice. The model does **style transfer**, adopting the anchor's statistical distribution instead of its own default.

The "hybrid" variant combines the style anchor with explicit AI trigger word kills, producing output that:
1. Matches the anchor's casual register and sentence rhythm
2. Eliminates all known Copyleaks trigger vocabulary
3. Uses contractions, colloquialisms, and informal transitions naturally

### Architecture

`lib/humanizer-style-anchor.ts` provides:
- 6 built-in anchors (stealthwriter-verified, tech-blogger, academic, casual, business, general)
- Auto-domain detection (keyword matching)
- Three rewrite modes: basic anchor, hybrid (anchor + anti-detection rules), chain (2-hop cross-model)

### Anchors

| ID | Domain | Source |
|---|---|---|
| `stealthwriter-01` | tech | Pair 01 output (Copyleaks-verified 0% AI) |
| `tech-blogger` | tech | Informal tech blog voice |
| `academic-student` | academic | Undergrad essay voice |
| `casual-forum` | casual | Forum comment voice |
| `business-email` | business | Professional email voice |
| `general-nonfiction` | general | General nonfiction voice |

### CLI

```sh
# List available anchors
npm run style-anchor:list

# Single rewrite with auto-detected anchor
node scripts/style-anchor-rewrite.mjs --file input.txt

# Specify anchor + hybrid mode
node scripts/style-anchor-rewrite.mjs --file input.txt --anchor casual-forum --hybrid

# Two-hop chain (Gemini → DeepSeek)
node scripts/style-anchor-rewrite.mjs --file input.txt --chain

# All anchors at once
node scripts/style-anchor-rewrite.mjs --file input.txt --all-anchors --out-dir outputs/
```

### Validation results (2026-05-14)

| Variant | Anchor | Mode | Copyleaks |
|---|---|---|---|
| dict+structural (v2) | n/a | regex post-processing | 100% AI |
| style-anchor basic | stealthwriter-01 | single model | Not tested (output still formal) |
| style-anchor basic | tech-blogger | single model | Not tested |
| **style-anchor hybrid** | **casual-forum** | **hybrid** | **All Clear** |
| style-anchor hybrid | academic-student | hybrid | Not yet tested |
| style-anchor hybrid | tech-blogger | hybrid | Not yet tested |

### Open questions

1. **Formality ceiling**: Can the academic-student hybrid pass Copyleaks? The casual-forum passes but changes the register dramatically.
2. **User-provided anchors**: The user's own writing would be the strongest possible anchor. Infrastructure exists but no UI yet.
3. **Integration**: Should this replace the current chain preset, or be a new "stealth" preset?

## Test commands

```sh
npm run test:phrase-dict       # 20 lexical tests
npm run test:structural        # 10 structural tests
npm run test:humanizer-stack   # 17 composition tests
npm run research:phrase-dict   # measurement report on the 6-pair corpus
npm run style-anchor:list      # show available style anchors
```
