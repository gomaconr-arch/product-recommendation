export const AUTH_SESSION_KEY = "product_recommendation.auth_session.v1";

export const USERS = [
  {
    user_id: "superadmin-root",
    role: "superadmin",
    email: "root@root.local",
    password: "r00t",
    name: "Root Admin",
    agent_id: null,
    agent_slug: null,
    agent_name: null,
    assessment_url: null
  },
  {
    user_id: "agent-richardo",
    role: "agent",
    email: "richard.badlisan@gmail.com",
    password: "richardo",
    name: "Richard B",
    agent_id: "richardo",
    agent_slug: "richardo",
    agent_name: "Richard B",
    assessment_url: "https://assess.lablibre.com/richardo"
  }
];

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function withoutPassword(user) {
  if (!user) return null;
  const { password, ...publicUser } = user;
  return publicUser;
}

export function authenticateUser(email, password) {
  const normalizedEmail = cleanString(email).toLowerCase();
  const normalizedPassword = cleanString(password);
  const user = USERS.find((item) => item.email.toLowerCase() === normalizedEmail && item.password === normalizedPassword);
  return withoutPassword(user);
}

export function readAuthSession() {
  try {
    const session = JSON.parse(window.localStorage.getItem(AUTH_SESSION_KEY) || "null");
    if (!session?.user_id) return null;
    return withoutPassword(USERS.find((user) => user.user_id === session.user_id));
  } catch {
    return null;
  }
}

export function saveAuthSession(user) {
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ user_id: user.user_id }));
}

export function clearAuthSession() {
  window.localStorage.removeItem(AUTH_SESSION_KEY);
}

export function canAccessLead(user, lead) {
  if (!user || !lead) return false;
  if (user.role === "superadmin") return true;
  return user.role === "agent" && lead.agent_id === user.agent_id;
}
