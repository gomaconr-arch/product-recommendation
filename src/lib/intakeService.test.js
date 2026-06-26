import { describe, expect, it } from "vitest";
import products from "../../data/products.json";
import pivotRules from "../../data/pivot-rules.json";
import { processAssessmentIntake } from "./intakeService.js";

const rawAssessment = {
  submittedAt: "2026-06-25T00:00:00.000Z",
  answers: {
    stage: "parent",
    income_stability: "stable",
    savings_habit: "irregular",
    emergencyFund: 2,
    protection: ["hmo"],
    dependents: ["spouse", "child"],
    priorities: ["family_protection"]
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
  agent: {
    agentSlug: "agent-1",
    agentName: "Agent One"
  },
  scoreData: {
    score: 58,
    breakdown: { cashflow: 15, emergency: 10, protection: 18, goals: 15 },
    persona: { title: "The Builder", subtitle: "Steady progress." },
    threats: [{ title: "Life gap", desc: "No life insurance indicated." }]
  }
};

function createD1Mock() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              calls.push({ sql, values });
              return { success: true };
            }
          };
        }
      };
    }
  };
}

describe("assessment intake service", () => {
  it("creates lead, recommendation, and log records in D1", async () => {
    const db = createD1Mock();
    const { response, lead, matchingInput, recommendationResult } = await processAssessmentIntake({
      rawPayload: rawAssessment,
      db,
      products,
      pivotRules
    });

    expect(response.ok).toBe(true);
    expect(response.leadId).toBe(lead.id);
    expect(response.recommendationId).toMatch(/^rec_/);
    expect(lead.name).toBe("Maria Santos");
    expect(lead.agent_slug).toBe("agent-1");
    expect(lead.agent_name).toBe("Agent One");
    expect(matchingInput.schema_version).toBe("financial_foundation_matching_input.v1");
    expect(recommendationResult.recommendations.length).toBeGreaterThan(0);
    expect(db.calls).toHaveLength(3);
    expect(db.calls[0].sql).toContain("INSERT INTO leads");
    expect(db.calls[1].sql).toContain("INSERT INTO recommendations");
    expect(db.calls[2].sql).toContain("INSERT INTO intake_logs");
  });

  it("rejects invalid raw assessment payloads before writing", async () => {
    const db = createD1Mock();
    const invalid = { ...rawAssessment, quoteData: { ...rawAssessment.quoteData, consent: false } };

    await expect(
      processAssessmentIntake({
        rawPayload: invalid,
        db,
        products,
        pivotRules
      })
    ).rejects.toThrow("This lead has not consented to data use.");

    expect(db.calls).toHaveLength(0);
  });
});
