import { SESSION_COOKIE_NAME, clearSessionCookie, jsonResponse } from "../../_shared/auth.js";

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
}

export async function onRequestPost({ request, env }) {
  const sessionId = getCookie(request, SESSION_COOKIE_NAME);
  if (env.DB && sessionId) {
    await env.DB.prepare("DELETE FROM auth_sessions WHERE id = ?").bind(sessionId).run();
  }

  return jsonResponse({ ok: true }, 200, {
    "Set-Cookie": clearSessionCookie()
  });
}

export async function onRequest() {
  return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
}
