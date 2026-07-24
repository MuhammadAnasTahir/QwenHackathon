# Extraction eval harness

Measures **per-field accuracy** of the prescription-extraction pipeline
(`/api/extract`: Qwen 3.7 Plus vision runs → self-consistency vote → Qwen 3.7 Max grounding)
against a set of real, hand-labeled prescription photos.

Without this we tune the prompt blind and find out on stage. With it we can say
*"we measured X% field-level accuracy on N real Pakistani prescriptions."*

## 1. Collect ~20 photos

- Real prescriptions from family, friends, a local clinic. Aim for variety:
  handwritten Urdu directions, Latin notation (`1 BD`, `TDS`, `HS`), mixed,
  printed, blurry, multi-medicine.
- Phone photos are fine — that is exactly what the app receives.
- `.jpg`, `.jpeg`, or `.png`. Drop them into `eval/images/` (create the folder).
- **Privacy:** crop or mask patient names/phone numbers before committing anything.
  Better: keep `eval/images/` and `eval/labels.json` out of git entirely.

## 2. Label them

Copy the example and edit:

```bash
cp eval/labels.example.json eval/labels.json
```

One entry per image; one object per medicine actually on the paper:

```json
{
  "image": "rx1.jpg",
  "medicines": [
    {
      "brand_name": "Augmentin 625mg",
      "quantity": "one_tablet",
      "frequency": "twice_daily",
      "food": "after_food",
      "duration_days": 5,
      "times": ["08:00", "20:00"]
    }
  ]
}
```

Allowed enum values (must match `lib/schema.ts` exactly):

| Field | Values |
|---|---|
| `quantity` | `half_tablet` `one_tablet` `two_tablets` `one_spoon` `half_spoon` `drops` `injection` `puff` `sachet` `unknown` |
| `frequency` | `once_daily` `twice_daily` `thrice_daily` `four_times_daily` `every_8_hours` `at_bedtime` `as_needed` `once_weekly` `unknown` |
| `food` | `before_food` `after_food` `empty_stomach` `with_milk` `any` `unknown` |
| `duration_days` | integer, or `null` for ongoing / not stated |
| `times` | array of `"HH:MM"` (24h). Standard derivation: once → `["08:00"]` (`["21:00"]` if bedtime), twice → `["08:00","20:00"]`, thrice → `["08:00","14:00","20:00"]`, 4x → `["06:00","12:00","18:00","23:00"]` |

If the paper genuinely doesn't say, label it `"unknown"` / `null` — the model is
*supposed* to refuse to guess, and the eval should reward that.

## 3. Run

```bash
npm run dev          # terminal 1 — needs DASHSCOPE_API_KEY in .env.local
npm run eval         # terminal 2   (= node eval/run.mjs)
```

Env overrides:

| Var | Default | Purpose |
|---|---|---|
| `EVAL_URL` | `http://localhost:3000/api/extract` | point at a deployed instance instead |
| `EVAL_RUNS` | server default (3) | self-consistency votes per image |

The script exits non-zero if any request fails.

## 4. How scoring works

- Labeled medicines are matched to extracted ones by **brand-name substring**
  (case-insensitive, either direction — `"Augmentin"` matches `"Augmentin 625mg"`).
- `quantity` / `frequency` / `food` / `duration_days`: exact match.
- `times`: set equality (order ignored).
- A labeled medicine the model never found counts as **wrong on every field** —
  a missed medicine is a full miss, not a skip.
- Extra extracted medicines not in the label are reported but not scored.
- Output: per-image field breakdown (with got/want on mismatches), then an
  aggregate per-field accuracy table and an overall number.

## 5. Iterate on the prompt

1. Run the eval, note the weakest field.
2. Edit `EXTRACTION_PROMPT` in `lib/prompts.ts` (enums, examples, the Latin
   abbreviation table, the never-guess rule).
3. Re-run. Keep the change only if the aggregate goes up.
4. Repeat. `EVAL_RUNS=1` gives faster (noisier) iterations; do a final full run
   at the default 3 votes before quoting a number.
