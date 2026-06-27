function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function assertObject(value, label) {
  if (!isObject(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
}

function assertString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertNumber(value, label) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${label} must be a number.`);
  }
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
}

function assertOption(value, label) {
  assertObject(value, label);
  assertString(value.id, `${label}.id`);
  assertString(value.label, `${label}.label`);
}

export function validateIntakeProducts(products) {
  assertArray(products, "Products");

  products.forEach((product, index) => {
    const label = `Products[${index}]`;
    assertObject(product, label);
    assertString(product.product_id, `${label}.product_id`);
    assertString(product.product_name, `${label}.product_name`);
    assertString(product.product_type, `${label}.product_type`);
    assertString(product.tagline, `${label}.tagline`);
    assertObject(product.payment_structure, `${label}.payment_structure`);
    assertArray(product.payment_structure.budget_band_fit, `${label}.payment_structure.budget_band_fit`);
    assertNumber(product.payment_structure.min_premium_estimate, `${label}.payment_structure.min_premium_estimate`);
    assertObject(product.suitability_rules, `${label}.suitability_rules`);
    assertNumber(product.suitability_rules.min_age, `${label}.suitability_rules.min_age`);
    assertNumber(product.suitability_rules.max_age, `${label}.suitability_rules.max_age`);
    assertArray(product.suitability_rules.not_recommended_if, `${label}.suitability_rules.not_recommended_if`);
    assertArray(product.protection_needs_covered, `${label}.protection_needs_covered`);
    assertNumber(product.match_weight_base, `${label}.match_weight_base`);
    assertBoolean(product.is_active, `${label}.is_active`);
  });
}

export function validateIntakePivotRules(pivotRules) {
  assertObject(pivotRules, "Pivot rules");
  assertObject(pivotRules.focus_to_protection_need_map, "Pivot rules.focus_to_protection_need_map");
  assertObject(pivotRules.priority_id_to_protection_need_map, "Pivot rules.priority_id_to_protection_need_map");
  assertObject(pivotRules.readiness_band_modifiers, "Pivot rules.readiness_band_modifiers");
  assertObject(pivotRules.protection_gap_rules, "Pivot rules.protection_gap_rules");
  assertObject(pivotRules.scoring_weights, "Pivot rules.scoring_weights");
  assertNumber(pivotRules.scoring_weights.focus_match, "Pivot rules.scoring_weights.focus_match");
  assertNumber(pivotRules.scoring_weights.priority_match, "Pivot rules.scoring_weights.priority_match");
  assertNumber(pivotRules.scoring_weights.protection_gap_boost, "Pivot rules.scoring_weights.protection_gap_boost");
  assertNumber(pivotRules.scoring_weights.budget_band_match, "Pivot rules.scoring_weights.budget_band_match");
  assertNumber(pivotRules.scoring_weights.readiness_band_alignment, "Pivot rules.scoring_weights.readiness_band_alignment");
}

export function validateIntakeMatchingInput(matchingInput) {
  assertObject(matchingInput, "Matching input");
  if (matchingInput.schema_version !== "financial_foundation_matching_input.v1") {
    throw new Error("Matching input.schema_version is invalid.");
  }

  assertObject(matchingInput.applicant_profile, "Matching input.applicant_profile");
  assertNumber(matchingInput.applicant_profile.age, "Matching input.applicant_profile.age");
  assertOption(matchingInput.applicant_profile.life_stage, "Matching input.applicant_profile.life_stage");
  assertBoolean(matchingInput.applicant_profile.has_dependents, "Matching input.applicant_profile.has_dependents");
  assertArray(matchingInput.applicant_profile.dependents, "Matching input.applicant_profile.dependents");

  assertObject(matchingInput.assessment_result, "Matching input.assessment_result");
  assertString(matchingInput.assessment_result.readiness_band, "Matching input.assessment_result.readiness_band");
  assertString(matchingInput.assessment_result.persona, "Matching input.assessment_result.persona");
  assertArray(matchingInput.assessment_result.pressure_points, "Matching input.assessment_result.pressure_points");

  assertObject(matchingInput.matching_signals, "Matching input.matching_signals");
  assertBoolean(matchingInput.matching_signals.has_health_coverage, "Matching input.matching_signals.has_health_coverage");
  assertBoolean(matchingInput.matching_signals.has_life_coverage, "Matching input.matching_signals.has_life_coverage");
  assertBoolean(matchingInput.matching_signals.has_any_protection, "Matching input.matching_signals.has_any_protection");
  assertString(matchingInput.matching_signals.emergency_fund_months_band, "Matching input.matching_signals.emergency_fund_months_band");
  assertArray(matchingInput.matching_signals.priority_ids, "Matching input.matching_signals.priority_ids");
  assertArray(matchingInput.matching_signals.protection_ids, "Matching input.matching_signals.protection_ids");
  assertArray(matchingInput.matching_signals.dependent_ids, "Matching input.matching_signals.dependent_ids");

  assertObject(matchingInput.matching_constraints, "Matching input.matching_constraints");
  assertString(matchingInput.matching_constraints.budget_range_id, "Matching input.matching_constraints.budget_range_id");
  assertBoolean(
    matchingInput.matching_constraints.avoid_payment_required_at_assessment,
    "Matching input.matching_constraints.avoid_payment_required_at_assessment"
  );
  assertString(
    matchingInput.matching_constraints.recommendation_should_align_to_primary_focus,
    "Matching input.matching_constraints.recommendation_should_align_to_primary_focus"
  );
}
