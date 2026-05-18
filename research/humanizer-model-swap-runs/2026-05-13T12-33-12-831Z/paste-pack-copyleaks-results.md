# Paste-Pack Copyleaks Results

Tested by user on 2026-05-13 at sensitivity `2/3`.

| Paste pack | Route | Characters | Words | Copyleaks % AI | AI phrases | Verdict |
|---|---|---:|---:|---:|---:|---|
| `minimax-free.txt` | MiniMax direct | 1,926 | 278 | 100% | 29 | Fail |
| `deepseek-v4.txt` | DeepSeek v4 direct | 2,355 | 311 | 100% | 33 | Fail |
| `current-chain.txt` | Current app chain | 2,722 | 384 | 100% | 39 | Fail |

## Interpretation

All three tested routes failed the scout threshold. The current model set is not enough to break Copyleaks on these fixed hard samples.

Visible detector-trigger phrases remain in the packs, especially in cybersecurity and business-copy sections:

- `digital age`
- `threat landscape`
- `malicious actors`
- `multifaceted`
- `robust solutions`
- `proactive defense`
- `has never been more critical`
- `trusted partner`
- `elevate their online presence`

This means the failure is not only a model-fingerprint problem. The current prompt routes also preserve too much generic source phrasing in hard domains.
