export const DISCLAIMER =
  "These are suggested options for review based on your assessment. They are not final recommendations — a licensed advisor will review your full situation before any policy is proposed.";

const LOW_EMERGENCY_FUND_BANDS = new Set(["none", "0months", "less_than_1month", "1-3months", "0-1months"]);

const FOCUS_LABELS = {
  family: "Family Protection",
  health: "Health Protection",
  savings: "Savings",
  invest: "Investment and Retirement",
  explore: "Explore Options"
};

function intersects(left = [], right = []) {
  const rightSet = new Set(right);
  return left.some((item) => rightSet.has(item));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function roundScore(score) {
  return Math.round(score * 10) / 10;
}

function toMatchPercentage(score) {
  return Math.max(0, Math.min(100, Math.round(score * 10)));
}

function makeIndicator(id, label, tone = "positive") {
  return { id, label, tone };
}

function isBudgetFilterApplicable(budgetRangeId) {
  return Boolean(budgetRangeId && budgetRangeId !== "unsure");
}

function getBudgetCeiling(budgetRangeId) {
  if (budgetRangeId === "<1500") return 1500;
  if (budgetRangeId === "1500-3000") return 3000;
  if (budgetRangeId === "3000-5000") return 5000;
  if (budgetRangeId === "5000+") return Infinity;
  return null;
}

function hasPremiumEstimateFit(product, budgetRangeId) {
  const ceiling = getBudgetCeiling(budgetRangeId);
  const estimate = Number(product.payment_structure.min_premium_estimate);
  if (ceiling == null || Number.isNaN(estimate)) return true;
  return estimate <= ceiling;
}

function hasBudgetFit(product, budgetRangeId) {
  if (!budgetRangeId) return false;
  return product.payment_structure.budget_band_fit.includes(budgetRangeId) && hasPremiumEstimateFit(product, budgetRangeId);
}

function notRecommendedConditionMatches(condition, input) {
  const signals = input.matching_signals;
  const answers = input.assessment_answers;

  if (condition in signals) return Boolean(signals[condition]);
  if (condition.startsWith("!")) {
    const key = condition.slice(1);
    return key in signals ? !signals[key] : false;
  }
  if (condition === "has_dependents") return input.applicant_profile.has_dependents;
  if (condition === "no_dependents") return !input.applicant_profile.has_dependents;

  return Object.values(answers).some((answer) => {
    if (Array.isArray(answer)) return answer.some((item) => item.id === condition);
    return answer?.id === condition;
  });
}

function getTriggeredGapRules(input, product, pivotRules) {
  const rules = pivotRules.protection_gap_rules;
  const triggered = [];

  if (
    rules.no_life_coverage_and_has_dependents &&
    input.matching_signals.has_life_coverage === false &&
    input.applicant_profile.has_dependents === true &&
    product.protection_needs_covered.includes(rules.no_life_coverage_and_has_dependents.boost_protection_need)
  ) {
    triggered.push(rules.no_life_coverage_and_has_dependents);
  }

  if (
    rules.no_health_coverage &&
    input.matching_signals.has_health_coverage === false &&
    product.protection_needs_covered.includes(rules.no_health_coverage.boost_protection_need)
  ) {
    triggered.push(rules.no_health_coverage);
  }

  return triggered;
}

function getPriorityMatches(input, product, pivotRules) {
  return input.matching_signals.priority_ids.flatMap((priorityId) => {
    const needs = pivotRules.priority_id_to_protection_need_map[priorityId] || [];
    return intersects(needs, product.protection_needs_covered) ? [{ priorityId, needs }] : [];
  });
}

function getComplianceFlags(product) {
  const flags = [...(product.compliance_flags || [])];
  if (!product.compliance_notes) return flags;
  if (/standard fna required before recommendation/i.test(product.compliance_notes)) return flags;
  return [...flags, product.compliance_notes];
}

function buildRecommendation(input, product, pivotRules) {
  const weights = pivotRules.scoring_weights;
  const readinessBand = input.assessment_result.readiness_band;
  const readiness = pivotRules.readiness_band_modifiers[readinessBand];
  const budgetRangeId = input.matching_constraints.budget_range_id;
  const focusId = input.matching_constraints.recommendation_should_align_to_primary_focus;
  const focusNeeds = pivotRules.focus_to_protection_need_map[focusId] || [];
  const focusMatched = focusNeeds.length > 0 && intersects(focusNeeds, product.protection_needs_covered);
  const priorityMatches = getPriorityMatches(input, product, pivotRules);
  const gapRules = getTriggeredGapRules(input, product, pivotRules);
  const budgetMatched = hasBudgetFit(product, budgetRangeId);

  let score = 0;
  const reasoning = [];
  const indicators = [];

  if (focusMatched) {
    score += weights.focus_match;
    reasoning.push(`Matches your selected focus: ${FOCUS_LABELS[focusId] || focusId}`);
    indicators.push(makeIndicator("focus", "Goal fit"));
  }

  if (priorityMatches.length > 0) {
    score += weights.priority_match * priorityMatches.length;
    indicators.push(makeIndicator("priority", "Priority fit"));
    if (product.product_id === "prumillion-protect") {
      reasoning.push("Budget-efficient option for income/family protection");
    } else {
      reasoning.push("Reflects your stated financial priority");
    }
  }

  for (const rule of gapRules) {
    score += weights.protection_gap_boost;
    reasoning.push(rule.reason);
    indicators.push(makeIndicator("gap", "Protection gap"));
  }

  if (budgetMatched && budgetRangeId !== "unsure") {
    score += weights.budget_band_match;
    const label = input.matching_constraints.budget_range_label;
    reasoning.push(label ? `Fits your stated budget comfort (${label.replace("PHP ", "PHP ")})` : "Fits within your stated budget range");
    indicators.push(makeIndicator("budget", "Budget fit"));
  } else if (budgetRangeId === "unsure") {
    reasoning.push("Can be reviewed even while your preferred budget is still being clarified");
    indicators.push(makeIndicator("budget_review", "Budget review", "neutral"));
  }

  if (
    LOW_EMERGENCY_FUND_BANDS.has(input.matching_signals.emergency_fund_months_band) &&
    product.payment_structure.pay_type === pivotRules.protection_gap_rules.low_emergency_fund?.boost_payment_structure
  ) {
    reasoning.push("Keeps flexibility in view while emergency savings are still building");
    indicators.push(makeIndicator("flexibility", "Flexible payments", "neutral"));
  }

  if (readiness) {
    score += weights.readiness_band_alignment;
    score *= readiness.score_multiplier;
  }

  score *= product.match_weight_base;

  return {
    product,
    match_score: roundScore(score),
    match_percentage: toMatchPercentage(score),
    reasoning: unique(reasoning),
    indicators: indicators.filter((indicator, index, list) => list.findIndex((item) => item.id === indicator.id) === index),
    compliance_flags: getComplianceFlags(product)
  };
}

function getIneligibilityReasons(input, product) {
  const reasons = [];

  if (!product.is_active) reasons.push("Product is currently inactive.");

  const age = input.applicant_profile.age;
  if (age < product.suitability_rules.min_age || age > product.suitability_rules.max_age) {
    reasons.push(`Client age ${age} is outside the allowed age range ${product.suitability_rules.min_age}-${product.suitability_rules.max_age}.`);
  }

  const budgetRangeId = input.matching_constraints.budget_range_id;
  if (isBudgetFilterApplicable(budgetRangeId) && !hasBudgetFit(product, budgetRangeId)) {
    reasons.push("Estimated payment is above the client's stated budget comfort.");
  }

  const blockedConditions = product.suitability_rules.not_recommended_if.filter((condition) =>
    notRecommendedConditionMatches(condition, input)
  );
  if (blockedConditions.length > 0) {
    reasons.push("Assessment answers suggest this product is not the clearest next step.");
  }

  return reasons;
}

function passesHardFilters(input, product) {
  return getIneligibilityReasons(input, product).length === 0;
}

function mapRecommendationResult(result, index, overrides = {}) {
  return {
    rank: index + 1,
    product_id: result.product.product_id,
    product_name: result.product.product_name,
    product_type: result.product.product_type,
    tagline: result.product.tagline,
    match_score: result.match_score,
    match_percentage: result.match_percentage,
    reasoning: result.reasoning,
    indicators: result.indicators,
    key_benefits: result.product.key_benefits,
    available_riders: result.product.available_riders || [],
    compliance_flags: result.compliance_flags,
    ...overrides
  };
}

export function getRecommendations(matchingInputJson, products, pivotRules) {
  const readinessBand = matchingInputJson.assessment_result.readiness_band;
  const readiness = pivotRules.readiness_band_modifiers[readinessBand] || {
    ui_tone: "encouraging",
    max_recommendations: 4
  };

  let recommendations = products
    .filter((product) => passesHardFilters(matchingInputJson, product))
    .map((product) => buildRecommendation(matchingInputJson, product, pivotRules))
    .filter((result) => result.match_score > 0)
    .sort((a, b) => b.match_score - a.match_score || a.product.product_name.localeCompare(b.product.product_name))
    .slice(0, readiness.max_recommendations)
    .map((result, index) => mapRecommendationResult(result, index));

  const ineligible_products = products
    .map((product) => ({
      product_id: product.product_id,
      product_name: product.product_name,
      product_type: product.product_type,
      tagline: product.tagline,
      reasons: getIneligibilityReasons(matchingInputJson, product)
    }))
    .filter((product) => product.reasons.length > 0);

  if (recommendations.length === 0) {
    const fallbackProduct = products.find((product) => product.product_id === "paa-plus");
    if (fallbackProduct) {
      const fallback = buildRecommendation(matchingInputJson, fallbackProduct, pivotRules);
      recommendations = [
        mapRecommendationResult(fallback, 0, {
          is_fallback: true,
          match_percentage: 50,
          indicators: [
            makeIndicator("fallback", "Default option", "neutral"),
            makeIndicator("advisor_review", "Needs advisor review", "warning")
          ],
          reasoning: ["PAA Plus is shown as the default product for advisor review because no product passed all eligibility filters."]
        })
      ];
    }
  }

  return {
    disclaimer: DISCLAIMER,
    ui_tone: readiness.ui_tone,
    recommendations,
    ineligible_products,
    max_recommendations_shown: readiness.max_recommendations
  };
}
