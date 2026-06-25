const PROPOSAL_BLOCKED_MESSAGE = "This lead has not consented to data use. Proposal generation is disabled.";

const LABELS = {
  stage: {
    single: "Single",
    single_nodep: "Single with no dependents",
    young_professional: "Young professional",
    parent: "Parent",
    family: "Family",
    pre_retiree: "Pre-retiree",
    retiree: "Retiree"
  },
  priorities: {
    family_protection: "Protecting my family",
    family: "Protecting my family",
    health: "Health protection",
    health_emergency: "Health protection",
    save: "Savings",
    savings: "Savings",
    invest: "Investment and retirement",
    investment: "Investment and retirement",
    retirement: "Investment and retirement",
    explore: "Explore options"
  },
  protection: {
    hmo: "Company HMO",
    health: "Health coverage",
    health_ins: "Personal health insurance",
    life: "Life insurance",
    critical_illness: "Critical illness coverage",
    accident: "Accident coverage",
    none: "No current protection"
  }
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toOption(id, lookup = {}) {
  return {
    id,
    label: lookup[id] || id.replaceAll("_", " ")
  };
}

function normalizeId(value) {
  return cleanString(value).toLowerCase().replace(/\s+/g, "_");
}

function includesAny(values, needles) {
  return values.some((value) => needles.some((needle) => value.includes(needle)));
}

export function calculateAge(dob, submittedAt = new Date().toISOString()) {
  const dobParts = cleanString(dob).split("-").map(Number);
  const referenceDate = new Date(submittedAt);

  if (dobParts.length !== 3 || dobParts.some((part) => Number.isNaN(part)) || Number.isNaN(referenceDate.getTime())) {
    return null;
  }

  const [birthYear, birthMonth, birthDay] = dobParts;
  let age = referenceDate.getUTCFullYear() - birthYear;
  const monthDelta = referenceDate.getUTCMonth() + 1 - birthMonth;
  const dayDelta = referenceDate.getUTCDate() - birthDay;

  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }

  return age;
}

function calculateAgeFromBirthYear(birthYear, submittedAt = new Date().toISOString()) {
  const year = Number(birthYear);
  const referenceDate = new Date(submittedAt);
  if (Number.isNaN(year) || Number.isNaN(referenceDate.getTime())) return null;
  return referenceDate.getUTCFullYear() - year;
}

function getApplicantAge(quoteData = {}, submittedAt) {
  const age = Number(quoteData.age);
  if (!Number.isNaN(age) && age > 0) return age;

  if (cleanString(quoteData.dob)) {
    return calculateAge(quoteData.dob, submittedAt);
  }

  return calculateAgeFromBirthYear(quoteData.birthYear, submittedAt);
}

function mapEmergencyFund(value) {
  if (value == null || value === "") return "unsure";
  const months = Number(value);
  if (Number.isNaN(months)) return normalizeId(value);
  if (months <= 0) return "0months";
  if (months < 1) return "less_than_1month";
  if (months <= 3) return "1-3months";
  if (months <= 6) return "3-6months";
  return "6months_plus";
}

function mapBudget(rawBudget) {
  const budget = normalizeId(rawBudget);
  if (!budget || budget === "unsure" || budget === "not_sure") {
    return { id: "unsure", label: "Still clarifying budget" };
  }

  if (budget.includes("below") || budget.includes("under") || budget.includes("<") || budget.includes("1000")) {
    return { id: "<1500", label: "Below PHP 1,500 / month" };
  }
  if (budget.includes("1500") || budget.includes("1,500")) return { id: "1500-3000", label: "PHP 1,500-3,000 / month" };
  if (budget.includes("3000") || budget.includes("3,000")) return { id: "3000-5000", label: "PHP 3,000-5,000 / month" };
  if (budget.includes("5000") || budget.includes("5,000")) return { id: "5000+", label: "PHP 5,000+ / month" };

  return { id: "unsure", label: cleanString(rawBudget) || "Still clarifying budget" };
}

function mapFocus(priorities = [], goal = "") {
  const values = [...priorities.map(normalizeId), normalizeId(goal)];
  if (includesAny(values, ["family", "dependent", "income"])) return "family";
  if (includesAny(values, ["health", "hospital", "critical"])) return "health";
  if (includesAny(values, ["invest", "retire"])) return "invest";
  if (includesAny(values, ["save", "emergency"])) return "savings";
  return "explore";
}

function mapReadinessBand(score) {
  const numericScore = Number(score);
  if (Number.isNaN(numericScore)) return "building";
  if (numericScore >= 75) return "stable";
  if (numericScore >= 45) return "on_track";
  return "building";
}

function mapPriorityIds(priorities = [], focusId) {
  const ids = priorities.map(normalizeId).filter(Boolean).map((priority) => {
    if (priority.includes("family") || priority.includes("income")) return "family_protection";
    if (priority.includes("health") || priority.includes("critical")) return "health_emergency";
    if (priority.includes("invest") || priority.includes("retire")) return "retirement_growth";
    if (priority.includes("save") || priority.includes("emergency")) return "emergency_savings";
    return priority;
  });

  if (focusId === "family") ids.push("family_protection");
  if (focusId === "health") ids.push("health_emergency");
  return [...new Set(ids)];
}

function mapPressurePoints(pressurePoints = []) {
  return pressurePoints.map((point) => ({
    title: point.title || "Assessment pressure point",
    status: point.status || "attention",
    summary: point.shortText || point.desc || point.subtitle || "Review this item with the client.",
    detail: point.detail || point.desc || "",
    why_it_matters: point.whyItMatters || point.why_it_matters || point.status || "",
    answer_preview: point.answerPreview || "",
    answer_topic: point.answerTopic || ""
  }));
}

export function validateRawAssessment(rawPayload) {
  const errors = [];
  const quoteData = rawPayload?.quoteData || {};
  const name = cleanString(quoteData.name);
  const email = cleanString(quoteData.email);
  const phone = cleanString(quoteData.phone);
  const dob = cleanString(quoteData.dob);
  const hasAgeSource = dob || quoteData.age != null || quoteData.birthYear != null;

  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return ["Paste a valid assessment JSON object."];
  }

  if (!name) errors.push("Lead name is required.");
  if (!email && !phone) errors.push("Lead email or phone is required.");
  if (!hasAgeSource) errors.push("Date of birth, age, or birth year is required.");
  if (quoteData.consent !== true) errors.push(PROPOSAL_BLOCKED_MESSAGE);

  const age = getApplicantAge(quoteData, rawPayload.submittedAt);
  if (hasAgeSource && (age == null || age < 0)) errors.push("Age source must be valid.");

  return errors;
}

export function createLeadFromRawAssessment(rawPayload, agentId) {
  const errors = validateRawAssessment(rawPayload);
  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }

  const quoteData = rawPayload.quoteData;
  return {
    lead_id: crypto.randomUUID(),
    name: cleanString(quoteData.name),
    phone: cleanString(quoteData.phone),
    email: cleanString(quoteData.email),
    age: getApplicantAge(quoteData, rawPayload.submittedAt),
    consent: true,
    raw_assessment: rawPayload,
    created_at: new Date().toISOString(),
    agent_id: agentId
  };
}

export function adaptRawAssessmentToMatchInput(rawPayload) {
  const errors = validateRawAssessment(rawPayload);
  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }

  const answers = rawPayload.answers || {};
  const quoteData = rawPayload.quoteData || {};
  const scoreData = rawPayload.scoreData || {};
  const protectionIds = asArray(answers.protection).map(normalizeId).filter(Boolean);
  const dependentIds = asArray(answers.dependents).map(normalizeId).filter(Boolean);
  const priorityValues = asArray(answers.priorities);
  const focusId = mapFocus(priorityValues, quoteData.goal);
  const budget = mapBudget(quoteData.budget);
  const hasLifeCoverage = includesAny(protectionIds, ["life", "insurance"]) && !protectionIds.includes("none");
  const hasHealthCoverage = includesAny(protectionIds, ["health", "hmo", "hospital", "critical"]);
  const hasAnyProtection = protectionIds.length > 0 && !protectionIds.includes("none");
  const personaTitle = scoreData.persona?.title || "Financial Foundation Client";
  const cta = scoreData.cta || rawPayload.quoteIntent || {};
  const pressurePoints = scoreData.pressurePoints || scoreData.threats || [];

  return {
    schema_version: "financial_foundation_matching_input.v1",
    generated_at: new Date().toISOString(),
    source: { app: "financial-foundation-check", result_type: "raw_assessment_export" },
    applicant_profile: {
      age: getApplicantAge(quoteData, rawPayload.submittedAt),
      gender: cleanString(quoteData.gender) || null,
      life_stage: toOption(normalizeId(answers.stage) || "unknown", LABELS.stage),
      has_dependents: dependentIds.length > 0,
      dependents: dependentIds.map((id) => toOption(id))
    },
    assessment_answers: {
      income_stability: toOption(normalizeId(answers.income_stability) || "unknown"),
      savings_habit: toOption(normalizeId(answers.savings_habit) || "unknown"),
      emergency_fund_duration: toOption(mapEmergencyFund(answers.emergencyFund)),
      current_protection: protectionIds.map((id) => toOption(id, LABELS.protection)),
      financial_priorities: mapPriorityIds(priorityValues, focusId).map((id) => toOption(id, LABELS.priorities))
    },
    personalization_inputs: {
      selected_focus: toOption(focusId),
      monthly_budget_comfort: budget,
      quote_intent: cleanString(quoteData.goal) || "explore_options"
    },
    assessment_result: {
      total_score: Number(scoreData.score) || 0,
      max_score: 100,
      readiness_band: mapReadinessBand(scoreData.score),
      persona: personaTitle,
      persona_subtitle: scoreData.persona?.subtitle || "",
      score_breakdown: scoreData.breakdown || {},
      pressure_points: mapPressurePoints(pressurePoints)
    },
    matching_signals: {
      has_health_coverage: hasHealthCoverage,
      has_life_coverage: hasLifeCoverage,
      has_any_protection: hasAnyProtection,
      emergency_fund_months_band: mapEmergencyFund(answers.emergencyFund),
      priority_ids: mapPriorityIds(priorityValues, focusId),
      protection_ids: protectionIds,
      dependent_ids: dependentIds
    },
    matching_constraints: {
      budget_range_id: budget.id,
      budget_range_label: budget.label,
      avoid_payment_required_at_assessment: true,
      recommendation_should_align_to_primary_focus: focusId
    },
    recommended_next_step: {
      headline: cta.headline || "Your financial foundation review",
      hook: cta.hook || scoreData.persona?.subtitle || "Review the next best protection step with your advisor.",
      button_text: cta.buttonText || "Review proposal",
      wizard_headline: cta.wizardHeadline || "Your Next Step"
    }
  };
}
