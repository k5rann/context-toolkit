# Chain vs Stealth — 2026-05-18T11-00-41-065Z

Samples: 11 (ai-test-corpus + phrase-chase inputs). Detector: none (GPTZero gated). Metrics are proxy signals only.

## Per-sample scores

| Sample | Input wc | Chain wc | Chain trig | Chain CV | Chain MATTR | Stealth wc | Stealth trig | Stealth CV | Stealth MATTR |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| corpus-01-academic-essay | 167 | 126 | 0 | 0.341 | 0.93 | 146 | 0 | 0.391 | 0.916 |
| corpus-02-business-copy | 148 | 93 | 2 | 0.187 | 0.963 | 156 | 0 | 0.553 | 0.859 |
| corpus-03-tech-explainer | 173 | 122 | 1 | 0.212 | 0.892 | 156 | 0 | 0.406 | 0.915 |
| corpus-04-casual-blog | 163 | 120 | 2 | 0.353 | 0.864 | 133 | 0 | 0.522 | 0.898 |
| corpus-05-product-description | 169 | 146 | 0 | 0.386 | 0.821 | 152 | 0 | 0.46 | 0.885 |
| phrase-pair-01-adapt-financial | 66 | 67 | 0 | 0.571 | 0.953 | 76 | 0 | 0.367 | 0.785 |
| phrase-pair-02-academic-essay | 167 | 116 | 0 | 0.388 | 0.888 | 160 | 0 | 0.385 | 0.906 |
| phrase-pair-03-business-copy | 148 | 101 | 1 | 0.379 | 0.865 | 145 | 0 | 0.45 | 0.912 |
| phrase-pair-04-tech-explainer | 173 | 122 | 3 | 0.416 | 0.892 | 166 | 0 | 0.328 | 0.913 |
| phrase-pair-05-casual-blog | 163 | 112 | 1 | 0.202 | 0.879 | 151 | 0 | 0.459 | 0.853 |
| phrase-pair-06-product-description | 169 | 104 | 0 | 0.253 | 0.91 | 126 | 0 | 0.276 | 0.818 |

## Aggregate (mean across samples)

| Metric | Chain | Stealth | Winner |
|---|---:|---:|---|
| Word count | 111.727 | 142.455 | **stealth** |
| Length retention | 0.735 | 0.933 | **stealth** |
| Trigger hits | 0.909 | 0 | **stealth** |
| Trigger density /1000w | 8.164 | 0 | **stealth** |
| Burstiness CV | 0.335 | 0.418 | **stealth** |
| MATTR | 0.896 | 0.878 | **chain** |
| Remaining swaps | 1.909 | 0.364 | **stealth** |
| Latency ms | 26722.818 | 13498.636 | **stealth** |

## Suggested Copyleaks picks

Paste the texts below into copyleaks.com for ground-truth AI%. These are the stealth outputs that scored best on proxy metrics:

- `stealth/corpus-02-business-copy.txt` (composite score 0.553)
- `stealth/corpus-04-casual-blog.txt` (composite score 0.522)
- `stealth/corpus-05-product-description.txt` (composite score 0.460)

Also include 1 chain output for the same sample as a direct A/B:
- `chain/corpus-02-business-copy.txt`