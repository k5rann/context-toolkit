# Validation quick-start

Goal: spend 1–2 Copyleaks credits to figure out which transform stack actually beats the detector. All transformed outputs are pre-generated; just paste and check.

## Pre-generated outputs

For each pair `pair-NN-shortname/`, the `transformed/` subfolder has 4 files:

| File | What it ran |
|---|---|
| `dict-only.txt` | Lexical phrase dict only |
| `structural-only.txt` | Clause-level rewrites only |
| `dict-plus-structural.txt` | Both lexical and structural |
| `all-three.txt` | Lexical + structural + burstiness (sentence-shape rewrite) |

Regenerate them anytime with `npm run phrase-chase:generate`.

## Suggested validation order (1–2 credits)

**Credit 1 — Pair 04 (tech explainer) `dict-plus-structural.txt`**

Why: highest vocab swap count (14+ in dict) and longest formal-register input. If the lexical + structural stack works anywhere, it should work here.

Outcomes:
- **< 40% AI** → Stack works. Default `HUMANIZER_PHRASE_DICT=on HUMANIZER_STRUCTURAL=on`.
- **40–80% AI** → Partial signal. Move to credit 2 with `all-three.txt` to test if burstiness closes the gap.
- **~100% AI** → Lexical + structural insufficient. Detector is reading deeper features we don't touch (sentence rhythm, semantic patterns).

**Credit 2 (conditional) — Same pair, `all-three.txt`**

Only if credit 1 came back 40–80%. If it came back ~100%, save the credit; another lexical pass won't help.

## CLI for ad-hoc text

```sh
# Pipe stdin
echo "Furthermore, sophisticated robust solutions..." | npm run humanize

# Read a file
node scripts/humanize-cli.mjs --file myfile.txt > out.txt

# Show swap counts
node scripts/humanize-cli.mjs --file myfile.txt --report

# Pick which transforms run
node scripts/humanize-cli.mjs --file myfile.txt --no-burstiness
node scripts/humanize-cli.mjs --file myfile.txt --only-dict
```

## Production wiring

Three env flags, default off, independent:

```sh
HUMANIZER_STRUCTURAL=on    # clause-level rewrites
HUMANIZER_PHRASE_DICT=on   # lexical swaps
HUMANIZER_BURSTINESS=on    # sentence-shape rewrites
```

Applied in order: structural → dict → burstiness. They compose; the stack is verified idempotent.

## If everything fails Copyleaks

Three failed attempts have already taught us what the signal *isn't* (model identity, sentence-shape, banned phrases). If the dict + structural stack also fails, the realistic next moves are:

1. **Source rewriting** — humanize against a reference *style* instead of a reference *output*. Feed the model a real human paragraph as a style anchor; sample its rhythm, transition patterns, sentence-onset variety.
2. **Cross-language detour** — translate out and back via a different model family.
3. **Accept honest limits and ship** — the humanizer's value isn't only beating Copyleaks; it's also producing readable, less-templated prose.

The user has explicitly rejected the "writing improver" rebrand. Stay on the humanizer goal.
