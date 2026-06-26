import { getSessionUser, jsonResponse } from "../../_shared/auth.js";

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, user: null, error: "D1 database binding DB is not configured." }, 500);
    const user = await getSessionUser(request, env.DB);
    return jsonResponse({ ok: Boolean(user), user });
  } catch (error) {
    return jsonResponse({ ok: false, user: null, error: error instanceof Error ? error.message : "Session lookup failed." }, 400);
  }
}

export async function onRequest() {
  return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
}
