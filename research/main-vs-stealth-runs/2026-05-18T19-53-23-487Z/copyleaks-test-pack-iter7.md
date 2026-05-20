# Copyleaks test pack — autoresearch iter 7 (best preset)

Generated 2026-05-18. Preset: stealth-sentence (sentence-level alternates + forbidden trigger words + gpt-4o-mini rewrite model).

**Baselines** (proxy: SW-similarity distance, lower=better):
  - iter 0 baseline (gemini-flash, no forbidden words): 22.36
  - iter 2 keep (gemini-flash, 24 forbidden words):     20.79
  - **iter 7 keep (gpt-4o-mini, 24 forbidden words):    19.40** ← this pack

**Earlier Copyleaks results** (for comparison):
  - chain (production):    100% AI
  - stealth-verbose v1:    100% AI (sample of 3)
  - StealthWriter (target): 0% AI

**Decision rule** (same as before):
  - Median ≤ 30%: ship as new default. Validates that proxy improvement transfers to Copyleaks.
  - Median 30-70%: partial transfer. More iterations needed.
  - Median > 70%: proxy didn't transfer. Pivot strategy.

---

## 1. EASY — Casual blog [stealth-sentence iter 7, 180 words]
Per-sample SW distance: 10.82 (very low — closest to SW fingerprint)

In our rapidly changing society, achieving a proper balance between work and personal life has grown increasingly essential. The rise of remote work, combined with adaptable hours and the ongoing demand to remain engaged, often leaves many of us battling to genuinely unplug when the day is over. Acknowledging that taking care of your mental and physical health is crucial, rather than optional, is key for achieving lasting success and fulfillment.

A variety of approaches can assist you in reaching a more balanced and healthy lifestyle. Establishing distinct limits between professional hours and personal time is essential from the outset. Including consistent physical activity, mindfulness techniques, and meaningful moments with family and friends in your everyday life can greatly improve your mental and physical health. It is essential to keep in mind that making small, regular adjustments can lead to significant outcomes as time goes on. Focusing on your well-being and making conscious choices about your time can help you develop a more rewarding and lasting way of living that supports your success in both your career and personal life.
---

## 2. MEDIUM — Business copy [stealth-sentence iter 7, 148 words]
Per-sample SW distance: 25.38
**Direct A/B target**: chain scored 100% / stealth scored 100% / StealthWriter scored 0% on this input.

Apex Solutions offers extensive services for digital transformation aimed at enabling businesses to succeed in a market that grows ever more competitive. Our group of experienced specialists utilizes advanced technology, analytical insights, and top-tier knowledge to provide customized solutions that meet the specific goals of every client. If your goals include improving efficiency, boosting customer interactions, or discovering new sources of income, our expertise and resources are here to support you in reaching lasting growth.

Our distinguishing feature is a steadfast dedication to quality and a strong enthusiasm for cultivating enduring collaborations with the brands we support. Successful digital transformation goes beyond just adopting new technologies; it focuses on fostering significant connections and achieving impactful results. Apex Solutions acts as a reliable ally for organizations seeking to enhance their visibility in the market and reach significant outcomes by integrating data analysis, imaginative storytelling, and a thorough knowledge of their industry.
---

## 3. HARD — Tech explainer [stealth-sentence iter 7, 185 words]
Per-sample SW distance: 25.40

In today's digital era, effective cybersecurity has emerged as a critical issue, with companies from various sectors confronting a growingly advanced array of threats. Malicious individuals are constantly adapting their strategies, ranging from sophisticated phishing schemes to ransomware assaults aimed at essential systems, to take advantage of weaknesses and unlawfully obtain private data. The fast-changing nature of today's world highlights the necessity of adopting a varied strategy for digital security that considers both technical protections and the human elements involved.

In order to safeguard against these dangers, businesses need to implement strong measures that observe network behavior, identify unusual patterns instantly, and react quickly to incidents as they arise. Despite having advanced security systems, relying solely on technical tools is inadequate - even one employee clicking on a harmful link can lead to considerable risk. As a result, effective training initiatives, well-defined guidelines, and consistent evaluations contribute significantly to strengthening the resilience of an organization. With the rise of threats driven by artificial intelligence, it is essential to adopt proactive defense measures to protect both the smooth operation of businesses and their reputation.
---

## 4. HARD — Academic essay [stealth-sentence iter 7, 161 words]
Per-sample SW distance: 13.63 (low)

Artificial intelligence stands out as a key technology of the twenty-first century, arising amid the swift changes of today's digital environment. Using advanced algorithms and large amounts of data, AI technologies are fundamentally changing how companies, schools, and people make decisions. The inclusion of machine learning in daily tasks has opened up remarkable possibilities for increasing productivity, improving processes, and enriching customer experiences in nearly all areas of the world economy.

This wave of technology brings its own set of difficulties. With the rapid growth of AI technology, significant ethical issues related to privacy, responsibility, and the careful implementation of automated systems have gained prominence in public discussions. Collaborative efforts among stakeholders are essential for creating strong structures that allow for the development and use of these impactful tools in ways that prioritize human well-being and encourage innovation. The direction in which artificial intelligence evolves will hinge on our shared capacity to harmonize advancement with careful supervision, openness, and moral principles.
---

## 5. HARDEST — Tech jargon (phrase-chase) [stealth-sentence iter 7, 182 words]
Per-sample SW distance: 25.55

In today's digital era, the challenge of cybersecurity stands out as a critical issue, with businesses from every sector encountering threats that grow more advanced. Ranging from sophisticated phishing schemes to ransomware assaults aimed at essential systems, cybercriminals are persistently adapting their strategies to take advantage of weaknesses and illegally obtain sensitive data. The fast-changing setting highlights the necessity of adopting a varied strategy for digital security that takes into account both technological protections and the role of people.

For companies to safeguard against these dangers, it is essential to implement strong measures that observe network behavior, identify irregularities instantly, and react promptly during incidents. Yet, relying solely on technical tools is inadequate; if just one employee engages with a harmful link, it can lead to considerable risk, no matter how advanced the security systems are. As a result, effective training initiatives, well-defined procedures, and frequent evaluations significantly contribute to strengthening a company's ability to recover from challenges. With the rise of AI-driven threats, developing proactive defense plans has become essential for protecting both business operations and reputation.
---

## Results table

| # | Difficulty | Sample | SW distance | Copyleaks AI % | Notes |
|---|---|---|---:|---:|---|
| 1 | EASY | casual-blog | 10.82 | ___ |  |
| 2 | MEDIUM (A/B) | business-copy | 25.38 | ___ |  |
| 3 | HARD | tech-explainer | 25.40 | ___ |  |
| 4 | HARD | academic-essay | 13.63 | ___ |  |
| 5 | HARDEST | tech-explainer-v2 | 25.55 | ___ |  |

## What to look for

Samples #1 and #4 are the proxy's strongest picks (lowest SW distance). If iter 7 transferred to Copyleaks at all, these should score lowest.
Samples #2, #3, #5 are mid-distance. If they also score low, the proxy is solidly transferring.
Sample #2 is the critical A/B point — same input where chain/stealth scored 100% and StealthWriter scored 0%.
