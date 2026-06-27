import { describe, expect, it } from "vitest";
import products from "../../data/products.json";
import pivotRules from "../../data/pivot-rules.json";
import sampleInput from "../../data/sample-input.json";
import { getRecommendations } from "./matchEngine.js";
import { validateMatchingInput, validatePivotRules, validateProducts } from "./validation.js";

describe("matching engine", () => {
  it("validates the real assessment input and editable data files", () => {
    expect(() => validateMatchingInput(sampleInput)).not.toThrow();
    expect(() => validateProducts(products)).not.toThrow();
    expect(() => validatePivotRules(pivotRules)).not.toThrow();
    expect(products.some((product) => "_verify_against_pdf" in product)).toBe(false);
  });

  it("ranks sample family-protection results against the real v1 schema", () => {
    const results = getRecommendations(sampleInput, products, pivotRules);

    expect(results.ui_tone).toBe("encouraging");
    expect(results.max_recommendations_shown).toBe(4);
    expect(results.recommendations).toHaveLength(3);
    expect(results.recommendations[0]).toMatchObject({
      rank: 1,
      product_id: "paa-plus",
      product_name: "PAA Plus",
      match_score: 9.5,
      match_percentage: 95
    });
    expect(results.recommendations.map((item) => item.product_id)).toEqual(["paa-plus", "elite-15", "pru-pep"]);
    expect(results.recommendations.find((item) => item.product_id === "prumillion-protect")).toBeUndefined();
    expect(results.recommendations[0].reasoning).toContain("Matches your selected focus: Family Protection");
    expect(results.disclaimer).toContain("not final recommendations");
  });

  it("does not hard-filter budget when the applicant is unsure", () => {
    const expandedPivotRules = {
      ...pivotRules,
      readiness_band_modifiers: {
        ...pivotRules.readiness_band_modifiers,
        on_track: {
          ...pivotRules.readiness_band_modifiers.on_track,
          max_recommendations: 20
        }
      }
    };
    const unsureInput = {
      ...sampleInput,
      matching_constraints: {
        ...sampleInput.matching_constraints,
        budget_range_id: "unsure",
        budget_range_label: "Unsure"
      }
    };

    const results = getRecommendations(unsureInput, products, expandedPivotRules);

    expect(results.recommendations.map((item) => item.product_id)).toContain("paa-plus");
    expect(results.recommendations.map((item) => item.product_id)).toContain("prumillion-protect");
  });

  it("filters products outside suitability age range", () => {
    const olderInput = {
      ...sampleInput,
      applicant_profile: {
        ...sampleInput.applicant_profile,
        age: 66
      }
    };

    const results = getRecommendations(olderInput, products, pivotRules);

    expect(results.recommendations.find((item) => item.product_id === "paa-plus")).toMatchObject({
      product_id: "paa-plus",
      is_fallback: true,
      match_percentage: 50
    });
    expect(results.recommendations.find((item) => item.product_id === "prumillion-protect")).toBeUndefined();
    expect(results.ineligible_products.find((item) => item.product_id === "paa-plus")?.reasons[0]).toContain("outside the allowed age range");
  });

  it("does not recommend products whose premium estimate exceeds stated budget comfort", () => {
    const lowBudgetFamilyInput = {
      ...sampleInput,
      matching_constraints: {
        ...sampleInput.matching_constraints,
        budget_range_id: "<1500",
        budget_range_label: "Below PHP 1,500 / month"
      }
    };

    const results = getRecommendations(lowBudgetFamilyInput, products, pivotRules);

    expect(results.recommendations.find((item) => item.product_id === "prumillion-protect")).toBeUndefined();
    expect(results.recommendations.find((item) => item.product_id === "paa-plus")).toMatchObject({
      product_id: "paa-plus",
      is_fallback: true,
      match_percentage: 50
    });
    expect(results.ineligible_products.find((item) => item.product_id === "paa-plus")?.reasons[0]).toContain("above the client's stated budget");
  });

  it("surfaces attorney referral compliance for PRULifetime Income matches", () => {
    const estateInput = {
      ...sampleInput,
      applicant_profile: {
        ...sampleInput.applicant_profile,
        age: 55,
        has_dependents: false,
        dependents: []
      },
      assessment_result: {
        ...sampleInput.assessment_result,
        readiness_band: "stable"
      },
      matching_signals: {
        ...sampleInput.matching_signals,
        priority_ids: ["retirement"],
        dependent_ids: []
      },
      matching_constraints: {
        ...sampleInput.matching_constraints,
        budget_range_id: "5000+",
        budget_range_label: "PHP 5,000+ / month",
        recommendation_should_align_to_primary_focus: "invest"
      }
    };

    const results = getRecommendations(estateInput, products, pivotRules);
    const lifetimeIncome = results.recommendations.find((item) => item.product_id === "prulifetime-income");

    expect(lifetimeIncome).toBeDefined();
    expect(lifetimeIncome.compliance_flags).toContain("attorney_referral_required");
  });
});
