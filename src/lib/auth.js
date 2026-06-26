export const AUTH_SESSION_KEY = "product_recommendation.auth_session.v1";
export const AGENTS_KEY = "product_recommendation.agents.v1";

export const ROOT_USER = {
  user_id: "superadmin-root",
  role: "superadmin",
  email: "root@root.local",
  password: "r00t",
  name: "Root Admin",
  agent_id: null,
  agent_slug: null,
  agent_name: null,
  assessment_url: null
};

export const SEEDED_AGENTS = [
  {
    user_id: "agent-richardo",
    role: "agent",
    email: "richard.badlisan@gmail.com",
    password: "richardo",
    name: "Richard B",
    agent_id: "richardo",
    agent_slug: "richardo",
    agent_name: "Richard B",
    assessment_url: "https://assess.lablibre.com/richardo",
    created_at: "2026-06-26T00:00:00.000Z",
    updated_at: "2026-06-26T00:00:00.000Z"
  }
];

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

function readStoredAgents() {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const parsed = JSON.parse(storage.getItem(AGENTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredAgents(agents) {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(AGENTS_KEY, JSON.stringify(agents));
}

function normalizeAgent(agent, existingAgent = null) {
  const name = cleanString(agent.name);
  const email = cleanString(agent.email).toLowerCase();
  const password = cleanString(agent.password);
  const agentSlug = slugify(agent.agent_slug || agent.agent_id || name);
  const now = new Date().toISOString();

  if (!name) throw new Error("Agent name is required.");
  if (!email) throw new Error("Agent email is required.");
  if (!password) throw new Error("Agent password is required.");
  if (!agentSlug) throw new Error("Agent slug is required.");

  return {
    user_id: existingAgent?.user_id || `agent-${agentSlug}`,
    role: "agent",
    email,
    password,
    name,
    agent_id: agentSlug,
    agent_slug: agentSlug,
    agent_name: name,
    assessment_url: cleanString(agent.assessment_url) || `https://assess.lablibre.com/${agentSlug}`,
    created_at: existingAgent?.created_at || now,
    updated_at: now
  };
}

export function withoutPassword(user) {
  if (!user) return null;
  const { password, ...publicUser } = user;
  return publicUser;
}

export function getAgents() {
  const storedAgents = readStoredAgents();
  const storedById = new Map(storedAgents.map((agent) => [agent.user_id, agent]));
  return SEEDED_AGENTS.map((agent) => storedById.get(agent.user_id) || agent).concat(
    storedAgents.filter((agent) => !SEEDED_AGENTS.some((seeded) => seeded.user_id === agent.user_id))
  );
}

export function getUsers() {
  return [ROOT_USER, ...getAgents()];
}

export function authenticateUser(email, password) {
  const normalizedEmail = cleanString(email).toLowerCase();
  const normalizedPassword = cleanString(password);
  const user = getUsers().find((item) => item.email.toLowerCase() === normalizedEmail && item.password === normalizedPassword);
  return withoutPassword(user);
}

export function readAuthSession() {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const session = JSON.parse(storage.getItem(AUTH_SESSION_KEY) || "null");
    if (!session?.user_id) return null;
    return withoutPassword(getUsers().find((user) => user.user_id === session.user_id));
  } catch {
    return null;
  }
}

export function saveAuthSession(user) {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(AUTH_SESSION_KEY, JSON.stringify({ user_id: user.user_id }));
}

export function clearAuthSession() {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(AUTH_SESSION_KEY);
}

export function saveAgent(agent) {
  const currentAgents = getAgents();
  const existingAgent = agent.user_id ? currentAgents.find((item) => item.user_id === agent.user_id) : null;
  const normalizedAgent = normalizeAgent(agent, existingAgent);
  const conflict = currentAgents.find(
    (item) =>
      (!existingAgent || item.user_id !== normalizedAgent.user_id) &&
      (item.email.toLowerCase() === normalizedAgent.email || item.agent_slug === normalizedAgent.agent_slug)
  );

  if (conflict) {
    throw new Error("Agent email or slug is already in use.");
  }

  const nextAgents = [
    normalizedAgent,
    ...currentAgents.filter((item) => item.user_id !== normalizedAgent.user_id)
  ].sort((left, right) => left.name.localeCompare(right.name));
  writeStoredAgents(nextAgents);
  return normalizedAgent;
}

export function deleteAgent(userId) {
  const agent = getAgents().find((item) => item.user_id === userId);
  if (!agent) return;
  writeStoredAgents(getAgents().filter((item) => item.user_id !== userId));
}

export function canAccessLead(user, lead) {
  if (!user || !lead) return false;
  if (user.role === "superadmin") return true;
  return user.role === "agent" && lead.agent_id === user.agent_id;
}
