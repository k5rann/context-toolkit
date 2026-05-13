#!/usr/bin/env bash
# Humanizer prompt coverage score — measures the breadth of detection-evading
# techniques present in the hop 2 prompt template. Used by autoresearch loop
# to track "drastic enhancement" as we add styles from books / ESL research /
# commercial humanizers / detection papers.
#
# Composite formula:
#   kill_entries          × 1   — each banned phrase/pattern in kill lists
#   genre_sections        × 10  — distinct content-type sections (TRAVEL, ACADEMIC, etc.)
#   pattern_rules         × 5   — generalized PATTERN rules (e.g. "adjective stacks")
#   move_directives       × 3   — MOVE N directives (style moves)
#   inflection_notes      × 2   — explicit inflection callouts
#   genre_examples        × 1   — concrete genre-specific examples in MOVE 2
#
# Output: a single integer (higher = more techniques present).

set -euo pipefail

PROMPT_FILE="${1:-lib/prompts/humanizer-template.ts}"

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "0"
  exit 1
fi

# Count entries in kill lists — lines starting with "  - \"" inside the prompt template literal
kill_entries=$(grep -cE '^\s+- "' "$PROMPT_FILE" || echo 0)

# Count genre sections — uppercase section labels like "TRAVEL CLICHES:", "ACADEMIC:", etc.
genre_sections=$(grep -cE '^\s+(UNIVERSAL|TRAVEL|ACADEMIC|EMOTIONAL|TECH|MARKETING|HYPE|BUSINESS|NEWS|RECIPE|TECHNICAL|CREATIVE|PRESS|BLOG|PRODUCT)' "$PROMPT_FILE" || echo 0)

# Count PATTERN rules — lines with "PATTERN —"
pattern_rules=$(grep -cE 'PATTERN —' "$PROMPT_FILE" || echo 0)

# Count MOVE directives — lines starting with "MOVE \d"
move_directives=$(grep -cE '^MOVE [0-9]+ —' "$PROMPT_FILE" || echo 0)

# Count inflection notes — explicit callouts about word-form variants
inflection_notes=$(grep -cE '(inflections?|all forms|grammatical forms)' "$PROMPT_FILE" || echo 0)

# Count genre-specific connector examples in MOVE 2
genre_examples=$(grep -cE '(Travel/casual|Academic/essay|Technical|Business/email|News/journalism|Recipe)' "$PROMPT_FILE" || echo 0)

score=$((kill_entries + 10 * genre_sections + 5 * pattern_rules + 3 * move_directives + 2 * inflection_notes + genre_examples))

# Optional verbose breakdown (suppressed unless --verbose)
if [[ "${1:-}" == "--verbose" ]] || [[ "${2:-}" == "--verbose" ]]; then
  echo "kill_entries     = $kill_entries" >&2
  echo "genre_sections   = $genre_sections" >&2
  echo "pattern_rules    = $pattern_rules" >&2
  echo "move_directives  = $move_directives" >&2
  echo "inflection_notes = $inflection_notes" >&2
  echo "genre_examples   = $genre_examples" >&2
  echo "TOTAL            = $score" >&2
fi

echo "$score"
