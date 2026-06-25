const optionSchema = {
  type: "object",
  required: ["id", "label"],
  properties: {
    id: { type: ["string", "null"] },
    label: { type: ["string", "null"] }
  },
  additionalProperties: true
};

export const matchingInputSchema = {
  type: "object",
  required: [
    "schema_version",
    "applicant_profile",
    "assessment_answers",
    "personalization_inputs",
    "assessment_result",
    "matching_signals",
    "matching_constraints",
    "recommended_next_step"
  ],
  properties: {
    schema_version: { const: "financial_foundation_matching_input.v1" },
    generated_at: { type: "string" },
    source: { type: "object" },
    applicant_profile: {
      type: "object",
      required: ["age", "life_stage", "has_dependents", "dependents"],
      properties: {
        age: { type: "number" },
        gender: { type: ["string", "null"] },
        life_stage: optionSchema,
        has_dependents: { type: "boolean" },
        dependents: { type: "array", items: optionSchema }
      },
      additionalProperties: true
    },
    assessment_answers: { type: "object" },
    personalization_inputs: { type: "object" },
    assessment_result: {
      type: "object",
      required: ["readiness_band", "persona", "pressure_points"],
      properties: {
        total_score: { type: "number" },
        max_score: { type: "number" },
        readiness_band: { enum: ["stable", "on_track", "building"] },
        persona: { type: "string" },
        score_breakdown: { type: "object" },
        pressure_points: { type: "array", items: { type: "object" } }
      },
      additionalProperties: true
    },
    matching_signals: {
      type: "object",
      required: [
        "has_health_coverage",
        "has_life_coverage",
        "has_any_protection",
        "emergency_fund_months_band",
        "priority_ids",
        "protection_ids",
        "dependent_ids"
      ],
      properties: {
        has_health_coverage: { type: "boolean" },
        has_life_coverage: { type: "boolean" },
        has_any_protection: { type: "boolean" },
        emergency_fund_months_band: { type: "string" },
        priority_ids: { type: "array", items: { type: "string" } },
        protection_ids: { type: "array", items: { type: "string" } },
        dependent_ids: { type: "array", items: { type: "string" } }
      },
      additionalProperties: true
    },
    matching_constraints: {
      type: "object",
      required: [
        "budget_range_id",
        "avoid_payment_required_at_assessment",
        "recommendation_should_align_to_primary_focus"
      ],
      properties: {
        budget_range_id: { type: ["string", "null"] },
        budget_range_label: { type: ["string", "null"] },
        avoid_payment_required_at_assessment: { type: "boolean" },
        recommendation_should_align_to_primary_focus: { type: ["string", "null"] }
      },
      additionalProperties: true
    },
    recommended_next_step: {
      type: "object",
      required: ["headline", "hook", "button_text", "wizard_headline"],
      properties: {
        headline: { type: "string" },
        hook: { type: "string" },
        button_text: { type: "string" },
        wizard_headline: { type: "string" }
      },
      additionalProperties: true
    }
  },
  additionalProperties: true
};

export const productSchema = {
  type: "object",
  required: [
    "product_id",
    "product_name",
    "product_type",
    "tagline",
    "product_description",
    "target_client_profile",
    "protection_needs_covered",
    "payment_structure",
    "default_coverage",
    "example_quotation",
    "suitability_rules",
    "match_weight_base",
    "compliance_notes",
    "is_active"
  ],
  properties: {
    product_id: { type: "string" },
    product_name: { type: "string" },
    product_type: { type: "string" },
    tagline: { type: "string" },
    target_client_profile: {
      type: "object",
      required: ["life_stage_ids"],
      properties: {
        age_range: { type: "array", items: { type: "number" }, minItems: 2 },
        income_band: { type: "string" },
        life_stage_ids: { type: "array", items: { type: "string" } },
        risk_appetite_fit: { type: "array", items: { type: "string" } }
      },
      additionalProperties: true
    },
    protection_needs_covered: { type: "array", items: { type: "string" } },
    payment_structure: {
      type: "object",
      required: ["pay_type", "modal_options", "min_premium_estimate", "minimum_annual_premium", "budget_band_fit", "currency"],
      properties: {
        pay_type: { type: "string" },
        modal_options: { type: "array", items: { type: "string" } },
        min_premium_estimate: { type: "number" },
        minimum_annual_premium: { type: "number" },
        budget_band_fit: { type: "array", items: { type: "string" } },
        currency: { type: "string" }
      },
      additionalProperties: true
    },
    default_coverage: {
      type: "object",
      required: ["sum_assured", "basis", "label"],
      properties: {
        sum_assured: { type: "number" },
        basis: { type: "string" },
        label: { type: "string" }
      },
      additionalProperties: true
    },
    example_quotation: {
      type: "object",
      required: ["profile", "base_sum_assured", "annual_premium", "notes"],
      properties: {
        profile: { type: "string" },
        base_sum_assured: { type: "number" },
        annual_premium: { type: "number" },
        notes: { type: "string" }
      },
      additionalProperties: true
    },
    suitability_rules: {
      type: "object",
      required: ["min_age", "max_age", "requires_fna", "not_recommended_if"],
      properties: {
        min_age: { type: "number" },
        max_age: { type: "number" },
        requires_fna: { type: "boolean" },
        not_recommended_if: { type: "array", items: { type: "string" } }
      },
      additionalProperties: true
    },
    match_weight_base: { type: "number" },
    compliance_notes: { type: "string" },
    compliance_flags: { type: "array", items: { type: "string" } },
    needs_review: { type: "boolean" },
    review_note: { type: "string" },
    is_active: { type: "boolean" }
  },
  additionalProperties: true
};

export const productsSchema = {
  type: "array",
  items: productSchema
};

export const pivotRulesSchema = {
  type: "object",
  required: [
    "schema_version",
    "focus_to_protection_need_map",
    "priority_id_to_protection_need_map",
    "readiness_band_modifiers",
    "protection_gap_rules",
    "scoring_weights",
    "hard_rules"
  ],
  properties: {
    schema_version: { type: "string" },
    focus_to_protection_need_map: { type: "object" },
    priority_id_to_protection_need_map: { type: "object" },
    readiness_band_modifiers: { type: "object" },
    protection_gap_rules: { type: "object" },
    scoring_weights: {
      type: "object",
      required: [
        "focus_match",
        "priority_match",
        "protection_gap_boost",
        "budget_band_match",
        "readiness_band_alignment"
      ],
      properties: {
        focus_match: { type: "number" },
        priority_match: { type: "number" },
        protection_gap_boost: { type: "number" },
        budget_band_match: { type: "number" },
        readiness_band_alignment: { type: "number" }
      },
      additionalProperties: true
    },
    hard_rules: {
      type: "object",
      required: ["no_purchase_language_pre_fna", "always_attach_disclaimer"],
      properties: {
        no_purchase_language_pre_fna: { type: "boolean" },
        always_attach_disclaimer: { type: "boolean" }
      },
      additionalProperties: true
    }
  },
  additionalProperties: true
};
