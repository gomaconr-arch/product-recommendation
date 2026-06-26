import { getSessionUser, jsonResponse } from "./auth.js";

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stringifyJson(value) {
  return JSON.stringify(value ?? null);
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLead(lead) {
  const rawAssessment = lead.raw_assessment || parseJson(lead.raw_assessment_json, {});
  const agentId = cleanString(lead.agent_id || lead.agent_slug || rawAssessment?.agent?.agentSlug || rawAssessment?.agentInfo?.agentSlug);
  const agentName = cleanString(lead.agent_name || rawAssessment?.agent?.agentName || rawAssessment?.agentInfo?.agentName);

  return {
    lead_id: lead.lead_id || lead.id,
    agent_id: agentId || null,
    agent_slug: agentId || null,
    agent_name: agentName || null,
    name: lead.name,
    email: lead.email || null,
    phone: lead.phone || null,
    age: lead.age,
    consent: Boolean(lead.consent),
    raw_assessment: rawAssessment,
    created_at: lead.created_at,
    call_done_at: lead.call_done_at || null,
    new_business_at: lead.new_business_at || null
  };
}

function normalizeProposal(proposal) {
  return {
    proposal_id: proposal.proposal_id || proposal.id,
    lead_id: proposal.lead_id,
    agent_id: proposal.agent_id || null,
    selected_product_id: proposal.selected_product_id,
    selected_riders: Array.isArray(proposal.selected_riders) ? proposal.selected_riders : parseJson(proposal.selected_riders_json, []),
    coverage_snapshot: proposal.coverage_snapshot || parseJson(proposal.coverage_snapshot_json, null),
    match_reasoning_snapshot: Array.isArray(proposal.match_reasoning_snapshot) ? proposal.match_reasoning_snapshot : parseJson(proposal.match_reasoning_snapshot_json, []),
    status: proposal.status,
    created_at: proposal.created_at,
    sent_at: proposal.sent_at || null,
    viewed_at: proposal.viewed_at || null,
    accepted_at: proposal.accepted_at || null,
    client_acceptance: proposal.client_acceptance || parseJson(proposal.client_acceptance_json, {
      checkbox_confirmed: false,
      confirmed_at: null,
      ip_or_session_ref: null
    }),
    public_share_token: proposal.public_share_token,
    booking: proposal.booking || parseJson(proposal.booking_json, null),
    booking_sent_at: proposal.booking_sent_at || null
  };
}

function canAccessLead(user, lead) {
  if (!user || !lead) return false;
  if (user.role === "superadmin") return true;
  return user.role === "agent" && lead.agent_id === user.agent_id;
}

async function requireUser(request, db) {
  const user = await getSessionUser(request, db);
  if (!user) throw new Error("Authentication is required.");
  return user;
}

export async function requireDb(env) {
  if (!env.DB) throw new Error("D1 database binding DB is not configured.");
  return env.DB;
}

export async function listLeads(request, db) {
  const user = await requireUser(request, db);
  const result = await db
    .prepare("SELECT * FROM leads ORDER BY created_at DESC")
    .all();
  return (result.results || [])
    .map(normalizeLead)
    .filter((lead) => canAccessLead(user, lead));
}

export async function getLeadById(db, leadId) {
  const row = await db
    .prepare("SELECT * FROM leads WHERE id = ? LIMIT 1")
    .bind(leadId)
    .first();
  return row ? normalizeLead(row) : null;
}

export async function saveLead(request, db) {
  const user = await requireUser(request, db);
  const lead = normalizeLead(await request.json());
  if (!lead.lead_id) throw new Error("Lead ID is required.");
  if (!canAccessLead(user, lead)) throw new Error("Lead access is denied.");

  await db
    .prepare(
      `INSERT INTO leads (
        id,
        agent_slug,
        agent_name,
        name,
        email,
        phone,
        age,
        consent,
        raw_assessment_json,
        created_at,
        call_done_at,
        new_business_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        agent_slug = excluded.agent_slug,
        agent_name = excluded.agent_name,
        name = excluded.name,
        email = excluded.email,
        phone = excluded.phone,
        age = excluded.age,
        consent = excluded.consent,
        raw_assessment_json = excluded.raw_assessment_json,
        call_done_at = excluded.call_done_at,
        new_business_at = excluded.new_business_at`
    )
    .bind(
      lead.lead_id,
      lead.agent_id,
      lead.agent_name,
      lead.name,
      lead.email,
      lead.phone,
      lead.age,
      lead.consent ? 1 : 0,
      stringifyJson(lead.raw_assessment),
      lead.created_at,
      lead.call_done_at,
      lead.new_business_at
    )
    .run();

  return lead;
}

export async function updateLead(request, db) {
  const user = await requireUser(request, db);
  const lead = normalizeLead(await request.json());
  const existingLead = await getLeadById(db, lead.lead_id);
  if (!existingLead || !canAccessLead(user, existingLead)) throw new Error("Lead access is denied.");
  const nextLead = normalizeLead({ ...existingLead, ...lead });

  await db
    .prepare(
      `UPDATE leads SET
        agent_slug = ?,
        agent_name = ?,
        name = ?,
        email = ?,
        phone = ?,
        age = ?,
        consent = ?,
        raw_assessment_json = ?,
        call_done_at = ?,
        new_business_at = ?
       WHERE id = ?`
    )
    .bind(
      nextLead.agent_id,
      nextLead.agent_name,
      nextLead.name,
      nextLead.email,
      nextLead.phone,
      nextLead.age,
      nextLead.consent ? 1 : 0,
      stringifyJson(nextLead.raw_assessment),
      nextLead.call_done_at,
      nextLead.new_business_at,
      nextLead.lead_id
    )
    .run();

  return nextLead;
}

export async function listProposals(request, db) {
  const user = await requireUser(request, db);
  const leads = await listLeads(request, db);
  const accessibleLeadIds = new Set(leads.map((lead) => lead.lead_id));
  const result = await db
    .prepare("SELECT * FROM proposals ORDER BY created_at DESC")
    .all();
  return (result.results || [])
    .map(normalizeProposal)
    .filter((proposal) => accessibleLeadIds.has(proposal.lead_id) || user.role === "superadmin");
}

export async function getProposalByToken(db, token) {
  const row = await db
    .prepare("SELECT * FROM proposals WHERE public_share_token = ? LIMIT 1")
    .bind(token)
    .first();
  return row ? normalizeProposal(row) : null;
}

async function getProposalById(db, proposalId) {
  const row = await db
    .prepare("SELECT * FROM proposals WHERE id = ? LIMIT 1")
    .bind(proposalId)
    .first();
  return row ? normalizeProposal(row) : null;
}

export async function getPublicProposal(db, token) {
  const proposal = await getProposalByToken(db, token);
  if (!proposal) return { lead: null, proposal: null };
  return {
    proposal,
    lead: await getLeadById(db, proposal.lead_id)
  };
}

async function ensureProposalAccess(user, db, proposal) {
  const lead = await getLeadById(db, proposal.lead_id);
  if (!canAccessLead(user, lead)) throw new Error("Proposal access is denied.");
}

export async function saveProposal(request, db) {
  const user = await requireUser(request, db);
  const proposal = normalizeProposal(await request.json());
  if (!proposal.proposal_id) throw new Error("Proposal ID is required.");
  await ensureProposalAccess(user, db, proposal);

  await db
    .prepare(
      `INSERT INTO proposals (
        id,
        lead_id,
        agent_id,
        selected_product_id,
        selected_riders_json,
        coverage_snapshot_json,
        match_reasoning_snapshot_json,
        status,
        created_at,
        sent_at,
        viewed_at,
        accepted_at,
        client_acceptance_json,
        public_share_token,
        booking_json,
        booking_sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        agent_id = excluded.agent_id,
        selected_product_id = excluded.selected_product_id,
        selected_riders_json = excluded.selected_riders_json,
        coverage_snapshot_json = excluded.coverage_snapshot_json,
        match_reasoning_snapshot_json = excluded.match_reasoning_snapshot_json,
        status = excluded.status,
        sent_at = excluded.sent_at,
        viewed_at = excluded.viewed_at,
        accepted_at = excluded.accepted_at,
        client_acceptance_json = excluded.client_acceptance_json,
        public_share_token = excluded.public_share_token,
        booking_json = excluded.booking_json,
        booking_sent_at = excluded.booking_sent_at`
    )
    .bind(
      proposal.proposal_id,
      proposal.lead_id,
      proposal.agent_id,
      proposal.selected_product_id,
      stringifyJson(proposal.selected_riders),
      stringifyJson(proposal.coverage_snapshot),
      stringifyJson(proposal.match_reasoning_snapshot),
      proposal.status,
      proposal.created_at,
      proposal.sent_at,
      proposal.viewed_at,
      proposal.accepted_at,
      stringifyJson(proposal.client_acceptance),
      proposal.public_share_token,
      stringifyJson(proposal.booking),
      proposal.booking_sent_at
    )
    .run();

  return proposal;
}

export async function updateProposal(request, db) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const proposal = normalizeProposal(await request.json());
  const existingProposal = token ? await getProposalByToken(db, token) : await getProposalById(db, proposal.proposal_id);

  if (!existingProposal) throw new Error("Proposal not found.");

  if (token) {
    if (existingProposal.public_share_token !== token || proposal.proposal_id !== existingProposal.proposal_id) {
      throw new Error("Proposal access is denied.");
    }
    proposal.lead_id = existingProposal.lead_id;
    proposal.agent_id = existingProposal.agent_id;
    proposal.selected_product_id = existingProposal.selected_product_id;
    proposal.selected_riders = existingProposal.selected_riders;
    proposal.coverage_snapshot = existingProposal.coverage_snapshot;
    proposal.match_reasoning_snapshot = existingProposal.match_reasoning_snapshot;
    proposal.created_at = existingProposal.created_at;
    proposal.sent_at = existingProposal.sent_at;
    proposal.public_share_token = existingProposal.public_share_token;
    proposal.booking = existingProposal.booking;
    proposal.booking_sent_at = existingProposal.booking_sent_at;
  } else {
    const user = await requireUser(request, db);
    await ensureProposalAccess(user, db, existingProposal);
  }

  const nextProposal = normalizeProposal({ ...existingProposal, ...proposal });
  await db
    .prepare(
      `UPDATE proposals SET
        agent_id = ?,
        selected_product_id = ?,
        selected_riders_json = ?,
        coverage_snapshot_json = ?,
        match_reasoning_snapshot_json = ?,
        status = ?,
        sent_at = ?,
        viewed_at = ?,
        accepted_at = ?,
        client_acceptance_json = ?,
        public_share_token = ?,
        booking_json = ?,
        booking_sent_at = ?
       WHERE id = ?`
    )
    .bind(
      nextProposal.agent_id,
      nextProposal.selected_product_id,
      stringifyJson(nextProposal.selected_riders),
      stringifyJson(nextProposal.coverage_snapshot),
      stringifyJson(nextProposal.match_reasoning_snapshot),
      nextProposal.status,
      nextProposal.sent_at,
      nextProposal.viewed_at,
      nextProposal.accepted_at,
      stringifyJson(nextProposal.client_acceptance),
      nextProposal.public_share_token,
      stringifyJson(nextProposal.booking),
      nextProposal.booking_sent_at,
      nextProposal.proposal_id
    )
    .run();

  return nextProposal;
}

export function workflowError(error, fallback, status = 400) {
  return jsonResponse({ ok: false, error: error instanceof Error ? error.message : fallback }, status);
}
