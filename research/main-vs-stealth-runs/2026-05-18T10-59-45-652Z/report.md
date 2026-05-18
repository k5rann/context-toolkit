# Chain vs Stealth — 2026-05-18T10-59-45-652Z

Samples: 1 (ai-test-corpus + phrase-chase inputs). Detector: none (GPTZero gated). Metrics are proxy signals only.

## Per-sample scores

| Sample | Input wc | Chain wc | Chain trig | Chain CV | Chain MATTR | Stealth wc | Stealth trig | Stealth CV | Stealth MATTR |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| corpus-01-academic-essay | 167 | 111 | 3 | 0.361 | 0.906 | 122 | 0 | 0.355 | 0.868 |

## Aggregate (mean across samples)

| Metric | Chain | Stealth | Winner |
|---|---:|---:|---|
| Word count | 111 | 122 | **stealth** |
| Length retention | 0.665 | 0.731 | **stealth** |
| Trigger hits | 3 | 0 | **stealth** |
| Trigger density /1000w | 27.03 | 0 | **stealth** |
| Burstiness CV | 0.361 | 0.355 | **chain** |
| MATTR | 0.906 | 0.868 | **chain** |
| Remaining swaps | 1 | 0 | **stealth** |
| Latency ms | 24355 | 23710 | **stealth** |

## Suggested Copyleaks picks

Paste the texts below into copyleaks.com for ground-truth AI%. These are the stealth outputs that scored best on proxy metrics:

- `stealth/corpus-01-academic-essay.txt` (composite score 0.355)

Also include 1 chain output for the same sample as a direct A/B:
- `chain/corpus-01-academic-essay.txt`