import { ROOT_USER, SEEDED_AGENTS, withoutPassword } from "../../src/lib/auth.js";

export const SESSION_COOKIE_NAME = "pr_session";

export function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders
    }
  });
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
}

function toDbAgent(agent, existingAgent = null) {
  const name = cleanString(agent.name);
  const email = cleanString(agent.email).toLowerCase();
  const password = cleanString(agent.password) || existingAgent?.password || "";
  const agentSlug = slugify(agent.agent_slug || agent.agent_id || name);
  const now = new Date().toISOString();

  if (!name) throw new Error("Agent name is required.");
  if (!email) throw new Error("Agent email is required.");
  if (!password) throw new Error("Agent password is required.");
  if (!agentSlug) throw new Error("Agent slug is required.");

  return {
    user_id: existingAgent?.user_id || agent.user_id || `agent-${agentSlug}`,
    role: "agent",
    email,
    password,
    name,
    agent_id: agentSlug,
    agent_slug: agentSlug,
    agent_name: name,
    assessment_url: cleanString(agent.assessment_url) || `https://assess.lablibre.com/${agentSlug}`,
    is_seeded: existingAgent?.is_seeded || 0,
    created_at: existingAgent?.created_at || now,
    updated_at: now
  };
}

function publicAgent(agent) {
  if (!agent) return null;
  return withoutPassword({
    ...agent,
    role: "agent",
    is_seeded: Boolean(agent.is_seeded)
  });
}

export async function ensureSeededAgents(db) {
  for (const agent of SEEDED_AGENTS) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO agents (
          user_id,
          email,
          password,
          name,
          agent_id,
          agent_slug,
          agent_name,
          assessment_url,
          is_seeded,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        agent.user_id,
        agent.email,
        agent.password,
        agent.name,
        agent.agent_id,
        agent.agent_slug,
        agent.agent_name,
        agent.assessment_url,
        1,
        agent.created_at,
        agent.updated_at
      )
      .run();
  }
}

export async function listDbAgents(db) {
  await ensureSeededAgents(db);
  const result = await db
    .prepare("SELECT * FROM agents ORDER BY name ASC")
    .all();
  return (result.results || []).map(publicAgent);
}

async function getDbAgentByEmail(db, email) {
  await ensureSeededAgents(db);
  return db
    .prepare("SELECT * FROM agents WHERE lower(email) = ? LIMIT 1")
    .bind(cleanString(email).toLowerCase())
    .first();
}

async function getDbAgentByUserId(db, userId) {
  await ensureSeededAgents(db);
  return db
    .prepare("SELECT * FROM agents WHERE user_id = ? LIMIT 1")
    .bind(userId)
    .first();
}

export async function saveDbAgent(db, agent) {
  await ensureSeededAgents(db);
  const existingAgent = agent.user_id
    ? await db.prepare("SELECT * FROM agents WHERE user_id = ? LIMIT 1").bind(agent.user_id).first()
    : null;
  const normalizedAgent = toDbAgent(agent, existingAgent);
  const conflict = await db
    .prepare(
      `SELECT user_id FROM agents
       WHERE (lower(email) = ? OR agent_slug = ?)
       AND (? IS NULL OR user_id != ?)
       LIMIT 1`
    )
    .bind(
      normalizedAgent.email,
      normalizedAgent.agent_slug,
      existingAgent?.user_id || null,
      existingAgent?.user_id || null
    )
    .first();

  if (conflict) {
    throw new Error("Agent email or slug is already in use.");
  }

  await db
    .prepare(
      `INSERT INTO agents (
        user_id,
        email,
        password,
        name,
        agent_id,
        agent_slug,
        agent_name,
        assessment_url,
        is_seeded,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        email = excluded.email,
        password = excluded.password,
        name = excluded.name,
        agent_id = excluded.agent_id,
        agent_slug = excluded.agent_slug,
        agent_name = excluded.agent_name,
        assessment_url = excluded.assessment_url,
        updated_at = excluded.updated_at`
    )
    .bind(
      normalizedAgent.user_id,
      normalizedAgent.email,
      normalizedAgent.password,
      normalizedAgent.name,
      normalizedAgent.agent_id,
      normalizedAgent.agent_slug,
      normalizedAgent.agent_name,
      normalizedAgent.assessment_url,
      normalizedAgent.is_seeded,
      normalizedAgent.created_at,
      normalizedAgent.updated_at
    )
    .run();

  return publicAgent(normalizedAgent);
}

export async function deleteDbAgent(db, userId) {
  const agent = await getDbAgentByUserId(db, userId);
  if (!agent) return;
  if (agent.is_seeded) throw new Error("Seeded agents cannot be deleted.");

  await db.prepare("DELETE FROM agents WHERE user_id = ?").bind(userId).run();
}

export async function authenticateDbUser(db, email, password) {
  const normalizedEmail = cleanString(email).toLowerCase();
  const normalizedPassword = cleanString(password);
  if (ROOT_USER.email.toLowerCase() === normalizedEmail && ROOT_USER.password === normalizedPassword) {
    return withoutPassword(ROOT_USER);
  }

  const agent = await getDbAgentByEmail(db, normalizedEmail);
  if (!agent || agent.password !== normalizedPassword) return null;
  return publicAgent(agent);
}

export async function createSession(db, user) {
  const sessionId = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  await db
    .prepare("INSERT INTO auth_sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(sessionId, user.user_id, createdAt.toISOString(), expiresAt.toISOString())
    .run();
  return { sessionId, expiresAt };
}

export async function getSessionUser(request, db) {
  const sessionId = getCookie(request, SESSION_COOKIE_NAME);
  if (!sessionId) return null;

  const session = await db
    .prepare("SELECT * FROM auth_sessions WHERE id = ? LIMIT 1")
    .bind(sessionId)
    .first();
  if (!session || new Date(session.expires_at).getTime() <= Date.now()) return null;

  if (session.user_id === ROOT_USER.user_id) return withoutPassword(ROOT_USER);
  const agent = await getDbAgentByUserId(db, session.user_id);
  return publicAgent(agent);
}

export async function requireSuperadmin(request, db) {
  const user = await getSessionUser(request, db);
  if (user?.role !== "superadmin") {
    throw new Error("Superadmin access is required.");
  }
  return user;
}

export function buildSessionCookie(sessionId, expiresAt) {
  return `${SESSION_COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Secure; Expires=${expiresAt.toUTCString()}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}
