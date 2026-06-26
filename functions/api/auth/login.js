import { authenticateDbUser, buildSessionCookie, createSession, jsonResponse } from "../../_shared/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: "D1 database binding DB is not configured." }, 500);

    const payload = await request.json();
    const user = await authenticateDbUser(env.DB, payload.email, payload.password);
    if (!user) return jsonResponse({ ok: false, error: "Email or password is incorrect." }, 401);

    const session = await createSession(env.DB, user);
    return jsonResponse({ ok: true, user }, 200, {
      "Set-Cookie": buildSessionCookie(session.sessionId, session.expiresAt)
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "Login failed." }, 400);
  }
}

export async function onRequest() {
  return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
}
