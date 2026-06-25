import { describe, expect, it } from "vitest";
import {
  adaptRawAssessmentToMatchInput,
  calculateAge,
  createLeadFromRawAssessment,
  validateRawAssessment
} from "./rawAssessmentAdapter.js";
import products from "../../data/products.json";
import pivotRules from "../../data/pivot-rules.json";
import { getRecommendations } from "./matchEngine.js";
import { validateMatchingInput } from "./validation.js";

const rawAssessment = {
  submittedAt: "2026-06-25T00:00:00.000Z",
  currentScreen: "complete",
  completedModules: ["foundation", "quote"],
  activeModuleId: "quote",
  answers: {
    stage: "parent",
    income_stability: "stable",
    savings_habit: "irregular",
    emergencyFund: 2,
    protection: ["hmo"],
    dependents: ["spouse", "child"],
    priorities: ["family_protection"],
    confidence: "medium"
  },
  quoteData: {
    dob: "1992-06-26",
    gender: "female",
    goal: "family protection",
    budget: "PHP 1,500-3,000 / month",
    name: "Maria Santos",
    phone: "+63 917 555 0123",
    email: "maria@example.com",
    consent: true
  },
  scoreData: {
    score: 58,
    breakdown: { cashflow: 15, emergency: 10, protection: 18, goals: 15 },
    persona: { title: "The Builder", emoji: "", subtitle: "Steady progress." },
    scoreColor: "gold",
    threats: [{ title: "Life gap", icon: "shield", status: "attention", bgClass: "", badgeClass: "", desc: "No life insurance indicated." }],
    cta: { headline: "Solid foundation", hook: "Close the gap.", buttonText: "Review options", icon: "shield" }
  },
  moduleTimings: { quote: "38s" }
};

const actualAssessmentExport = {
  submittedAt: "2026-06-23T23:10:33.828Z",
  currentScreen: "quote_form",
  completedModules: ["life", "cashflow", "emergency", "protection", "goals"],
  activeModuleId: "goals",
  answers: {
    stage: "single_nodep",
    income_stability: "very_stable",
    savings_habit: "struggling",
    emergencyFund: 1,
    protection: ["health_ins"],
    dependents: ["spouse", "parents", "kids"],
    priorities: ["save"],
    confidence: ""
  },
  quoteData: {
    age: 37,
    gender: "",
    goal: "health",
    budget: "<1500",
    name: "Juan Dela Cruz",
    phone: "09654112345",
    email: "juandelacruz@gmail.com",
    consent: true,
    birthYear: 1989
  },
  quoteIntent: {
    headline: "Your family support plan is worth reviewing.",
    buttonText: "Complete My Review",
    wizardHeadline: "Let's complete your review."
  },
  scoreData: {
    score: 50,
    breakdown: { cashflow: 10, emergency: 5, protection: 10, goals: 25 },
    persona: {
      title: "Building Your Starting Point",
      emoji: "",
      subtitle: "You have a starting point, with a few areas that could be stronger."
    },
    scoreColor: "stroke-amber-400",
    pressurePoints: [
      {
        title: "Emergency Fund",
        status: "Getting There",
        desc: "Your savings are starting to build, but a surprise expense could affect your current cash flow.",
        shortText: "Your cash buffer may need more room for surprise expenses.",
        answerPreview: "Less than 1 month",
        answerTopic: "emergency savings",
        detail: "Your answers suggest your emergency fund may still be in progress.",
        whyItMatters: "A cash buffer can protect monthly bills."
      },
      {
        title: "Family Support",
        status: "Worth Reviewing",
        desc: "People may rely on your income. A backup plan can help support them if income is interrupted.",
        shortText: "Your income may support people beyond yourself.",
        answerPreview: "Spouse/Partner, Parents/Siblings, Children",
        answerTopic: "family support",
        detail: "Your answers suggest others may rely on your income.",
        whyItMatters: "A backup plan helps protect family expenses."
      }
    ],
    cta: {
      headline: "Your family support plan is worth reviewing.",
      hook: "You work hard for your family. Reviewing a backup plan can help keep their needs in view.",
      buttonText: "Complete My Review",
      wizardHeadline: "Let's complete your review.",
      icon: ""
    }
  },
  moduleTimings: {
    life: "Finished exactly 2 seconds!",
    cashflow: "Wow, you're done in less than 12 seconds!"
  }
};

describe("raw assessment adapter", () => {
  it("derives exact age from dob and submittedAt", () => {
    expect(calculateAge("1992-06-26", "2026-06-25T00:00:00.000Z")).toBe(33);
    expect(calculateAge("1992-06-25", "2026-06-25T00:00:00.000Z")).toBe(34);
  });

  it("creates a lead record with contact fields and raw assessment", () => {
    const lead = createLeadFromRawAssessment(rawAssessment, "agent-1");
    expect(lead.name).toBe("Maria Santos");
    expect(lead.email).toBe("maria@example.com");
    expect(lead.phone).toBe("+63 917 555 0123");
    expect(lead.age).toBe(33);
    expect(lead.raw_assessment).toBe(rawAssessment);
  });

  it("blocks proposal generation when consent is not true", () => {
    const invalid = { ...rawAssessment, quoteData: { ...rawAssessment.quoteData, consent: false } };
    expect(validateRawAssessment(invalid)).toContain("This lead has not consented to data use. Proposal generation is disabled.");
  });

  it("adapts raw assessment into schema-valid matching input", () => {
    const matchingInput = adaptRawAssessmentToMatchInput(rawAssessment);
    expect(() => validateMatchingInput(matchingInput)).not.toThrow();
    expect(matchingInput.applicant_profile.age).toBe(33);
    expect(matchingInput.matching_signals.has_life_coverage).toBe(false);
    expect(matchingInput.matching_constraints.budget_range_id).toBe("1500-3000");
    expect(matchingInput.assessment_result.pressure_points[0].summary).toBe("No life insurance indicated.");
  });

  it("processes the actual assessment app export shape", () => {
    const errors = validateRawAssessment(actualAssessmentExport);
    expect(errors).toEqual([]);

    const lead = createLeadFromRawAssessment(actualAssessmentExport, "agent-1");
    expect(lead.name).toBe("Juan Dela Cruz");
    expect(lead.age).toBe(37);

    const matchingInput = adaptRawAssessmentToMatchInput(actualAssessmentExport);
    expect(() => validateMatchingInput(matchingInput)).not.toThrow();
    expect(matchingInput.applicant_profile.age).toBe(37);
    expect(matchingInput.matching_signals.has_health_coverage).toBe(true);
    expect(matchingInput.matching_constraints.budget_range_id).toBe("<1500");
    expect(matchingInput.assessment_result.pressure_points[0].summary).toBe("Your cash buffer may need more room for surprise expenses.");
    expect(matchingInput.recommended_next_step.wizard_headline).toBe("Let's complete your review.");

    const results = getRecommendations(matchingInput, products, pivotRules);
    expect(results.recommendations.find((item) => item.product_id === "prumillion-protect")).toBeUndefined();
  });
});
