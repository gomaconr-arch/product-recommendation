# Insurance Product Recommendation Web App

Decision-support web app for consuming `financial_foundation_matching_input.v1` output from the Financial Foundation Check and returning possible insurance product matches for advisor review.

This app must not present product output as final financial advice. The persistent disclaimer and advisor review framing are part of the product behavior.

## Run

```bash
npm install
npm run dev
```

## Seeded Login

The current advisor workspace uses seeded frontend login accounts:

- Superadmin: `root@root.local` / `r00t`
- Agent: `richard.badlisan@gmail.com` / `richardo`

Richard B is configured with agent slug `richardo` and assessment URL `https://assess.lablibre.com/richardo`. The superadmin account is not tied to an agent profile and can see all local records. The agent account only sees local records tagged with its agent ID.

This is a first-pass login gate for the current frontend/localStorage workspace. Replace it with server-backed authentication before relying on it for sensitive production access.

## Test

```bash
npm test
npm run build
```

## Assessment Intake API

Cloudflare Pages Functions exposes:

```text
POST /api/assessment-intake
```

The endpoint accepts raw Financial Foundation Check assessment JSON from `free-assess`, validates required lead fields and consent with `src/lib/rawAssessmentAdapter.js`, adapts the payload to `financial_foundation_matching_input.v1`, runs `src/lib/matchEngine.js`, and persists the raw payload, lead, matching input, recommendation result, and intake log to D1.

Successful response:

```json
{
  "ok": true,
  "leadId": "generated-lead-id",
  "recommendationId": "generated-recommendation-id"
}
```

Error response:

```json
{
  "ok": false,
  "error": "Readable error message"
}
```

### Security

Set `ASSESSMENT_INTAKE_SECRET` in Cloudflare Pages production environment variables. When this variable is set, callers must send:

```text
X-Assessment-Secret: <secret>
```

If `ASSESSMENT_INTAKE_SECRET` is not set, requests are allowed for local/dev ease. Do not expose this secret to frontend code.

`free-assess` should point to:

```text
EXTERNAL_SYSTEM_ENDPOINT=https://leads.lablibre.com/api/assessment-intake
EXTERNAL_SYSTEM_SHARED_SECRET=<same secret as ASSESSMENT_INTAKE_SECRET>
```

or configure its assessment payload with:

```json
{
  "externalSystemEndpoint": "https://leads.lablibre.com/api/assessment-intake"
}
```

## Cloudflare D1 Setup

Create the D1 database:

```bash
npx wrangler d1 create product-recommendation
```

Apply the migration:

```bash
npx wrangler d1 migrations apply product-recommendation
```

For local Pages development, use the same migration with Wrangler Pages:

```bash
npx wrangler pages dev dist --d1 DB=product-recommendation
```

In the Cloudflare dashboard, configure the Pages project D1 binding:

- Binding name: `DB`
- Database: the D1 database created above

Also add the production environment variable:

- `ASSESSMENT_INTAKE_SECRET`

The initial schema is in `migrations/0001_create_intake_tables.sql` and creates:

- `leads`
- `recommendations`
- `intake_logs`

The current frontend still uses browser `localStorage` through `src/lib/storage.js`. The backend intake path is now D1-backed; replacing the existing advisor UI data source with D1-backed read/list endpoints remains a separate follow-up.

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
