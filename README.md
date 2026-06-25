# Insurance Product Recommendation Web App

Decision-support web app for consuming `financial_foundation_matching_input.v1` output from the Financial Foundation Check and returning possible insurance product matches for advisor review.

This app must not present product output as final financial advice. The persistent disclaimer and advisor review framing are part of the product behavior.

## Run

```bash
npm install
npm run dev
```

## Test

```bash
npm test
npm run build
```

## Data Sources

Editable matching data lives only in:

- `data/products.json`
- `data/pivot-rules.json`

The matching logic is in `src/lib/matchEngine.js` and does not hardcode product definitions.

## Add A Product

1. Add a product object to `data/products.json`.
2. Include `payment_structure.budget_band_fit` using the same IDs as `matching_constraints.budget_range_id`: `<1500`, `1500-3000`, `3000-5000`, `5000+`, `unsure`.
3. Include `target_client_profile.life_stage_ids` that match upstream `applicant_profile.life_stage.id` values.
4. Keep `suitability_rules.min_age`, `suitability_rules.max_age`, `requires_fna`, and `not_recommended_if` explicit.
5. Run `npm test` so JSON Schema validation and ranking behavior still pass.

## Priority Mapping TODO

`data/pivot-rules.json` contains `priority_id_to_protection_need_map`.

Before advisor use, replace or confirm the seeded keys against the actual `JOURNEY_MODULES` priorities option list from the Financial Foundation Check source. Current keys include examples such as `family_protection`, `health_emergency`, `education`, and `retirement`, but this must be verified against the live option IDs before go-live.

Dependents IDs should also be confirmed against the upstream `dependents` question option list. The current engine consumes `matching_signals.dependent_ids` as provided and does not re-derive them from answer text.

## Matching Contract

The engine accepts:

```js
getRecommendations(matchingInputJson, products, pivotRules)
```

Primary matching surfaces are `matching_signals` and `matching_constraints`. The engine intentionally avoids re-deriving normalized signals from raw assessment answers.
