import { deleteDbAgent, jsonResponse, listDbAgents, requireSuperadmin, saveDbAgent } from "../_shared/auth.js";

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: "D1 database binding DB is not configured." }, 500);
    await requireSuperadmin(request, env.DB);
    return jsonResponse({ ok: true, agents: await listDbAgents(env.DB) });
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "Unable to load agents." }, 403);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: "D1 database binding DB is not configured." }, 500);
    await requireSuperadmin(request, env.DB);
    const agent = await saveDbAgent(env.DB, await request.json());
    return jsonResponse({ ok: true, agent });
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "Unable to save agent." }, 400);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: "D1 database binding DB is not configured." }, 500);
    await requireSuperadmin(request, env.DB);
    const url = new URL(request.url);
    const userId = url.searchParams.get("user_id");
    if (!userId) return jsonResponse({ ok: false, error: "Agent user_id is required." }, 400);

    await deleteDbAgent(env.DB, userId);
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "Unable to delete agent." }, 400);
  }
}

export async function onRequest() {
  return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
}
