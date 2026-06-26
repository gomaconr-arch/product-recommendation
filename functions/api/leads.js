import { jsonResponse } from "../_shared/auth.js";
import { listLeads, requireDb, saveLead, updateLead, workflowError } from "../_shared/workflow.js";

export async function onRequestGet({ request, env }) {
  try {
    const db = await requireDb(env);
    return jsonResponse({ ok: true, leads: await listLeads(request, db) });
  } catch (error) {
    return workflowError(error, "Unable to load leads.", 403);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const db = await requireDb(env);
    return jsonResponse({ ok: true, lead: await saveLead(request, db) });
  } catch (error) {
    return workflowError(error, "Unable to save lead.");
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const db = await requireDb(env);
    return jsonResponse({ ok: true, lead: await updateLead(request, db) });
  } catch (error) {
    return workflowError(error, "Unable to update lead.");
  }
}

export async function onRequest() {
  return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
}
