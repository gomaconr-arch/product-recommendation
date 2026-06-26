import { describe, expect, it } from "vitest";
import { authenticateUser, canAccessLead } from "./auth.js";

describe("auth", () => {
  it("authenticates the seeded superadmin", () => {
    const user = authenticateUser("root@root.local", "r00t");

    expect(user).toMatchObject({
      role: "superadmin",
      email: "root@root.local",
      agent_id: null
    });
    expect(user.password).toBeUndefined();
  });

  it("authenticates the seeded Richard agent", () => {
    const user = authenticateUser("richard.badlisan@gmail.com", "richardo");

    expect(user).toMatchObject({
      role: "agent",
      name: "Richard B",
      agent_id: "richardo",
      assessment_url: "https://assess.lablibre.com/richardo"
    });
  });

  it("limits agents to their own leads while superadmin can access all leads", () => {
    const admin = authenticateUser("root@root.local", "r00t");
    const agent = authenticateUser("richard.badlisan@gmail.com", "richardo");

    expect(canAccessLead(admin, { agent_id: "other-agent" })).toBe(true);
    expect(canAccessLead(agent, { agent_id: "richardo" })).toBe(true);
    expect(canAccessLead(agent, { agent_id: "other-agent" })).toBe(false);
  });
});
