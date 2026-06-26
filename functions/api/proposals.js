import { jsonResponse } from "../_shared/auth.js";
import {
  getPublicProposal,
  listProposals,
  requireDb,
  saveProposal,
  updateProposal,
  workflowError
} from "../_shared/workflow.js";

export async function onRequestGet({ request, env }) {
  try {
    const db = await requireDb(env);
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (token) {
      const { lead, proposal } = await getPublicProposal(db, token);
      if (!proposal || !lead) return jsonResponse({ ok: false, error: "Proposal not found." }, 404);
      return jsonResponse({ ok: true, lead, proposal });
    }

    return jsonResponse({ ok: true, proposals: await listProposals(request, db) });
  } catch (error) {
    return workflowError(error, "Unable to load proposals.", 403);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const db = await requireDb(env);
    return jsonResponse({ ok: true, proposal: await saveProposal(request, db) });
  } catch (error) {
    return workflowError(error, "Unable to save proposal.");
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const db = await requireDb(env);
    return jsonResponse({ ok: true, proposal: await updateProposal(request, db) });
  } catch (error) {
    return workflowError(error, "Unable to update proposal.");
  }
}

export async function onRequest() {
  return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
}
