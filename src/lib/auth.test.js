import { beforeEach, describe, expect, it } from "vitest";
import { AGENTS_KEY, authenticateUser, canAccessLead, getAgents, saveAgent } from "./auth.js";

function installLocalStorage() {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem(key) {
        return values.get(key) || null;
      },
      setItem(key, value) {
        values.set(key, value);
      },
      removeItem(key) {
        values.delete(key);
      }
    }
  };
}

describe("auth", () => {
  beforeEach(() => {
    installLocalStorage();
  });

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

  it("saves a managed agent that can sign in", () => {
    const agent = saveAgent({
      name: "Juan D",
      email: "juan@example.com",
      password: "juan-password",
      agent_slug: "juan"
    });

    expect(agent).toMatchObject({
      role: "agent",
      agent_id: "juan",
      assessment_url: "https://assess.lablibre.com/juan"
    });
    expect(getAgents().map((item) => item.agent_id)).toContain("juan");
    expect(authenticateUser("juan@example.com", "juan-password")).toMatchObject({
      name: "Juan D",
      agent_id: "juan"
    });
    expect(window.localStorage.getItem(AGENTS_KEY)).toContain("juan@example.com");
  });

  it("rejects duplicate agent email or slug", () => {
    saveAgent({
      name: "Juan D",
      email: "juan@example.com",
      password: "juan-password",
      agent_slug: "juan"
    });

    expect(() =>
      saveAgent({
        name: "Juan Duplicate",
        email: "juan@example.com",
        password: "another-password",
        agent_slug: "juan-two"
      })
    ).toThrow("Agent email or slug is already in use.");

    expect(() =>
      saveAgent({
        name: "Juan Slug",
        email: "juan-slug@example.com",
        password: "another-password",
        agent_slug: "juan"
      })
    ).toThrow("Agent email or slug is already in use.");
  });
});
