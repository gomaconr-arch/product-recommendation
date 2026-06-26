const LEADS_KEY = "product_recommendation.leads.v1";
const PROPOSALS_KEY = "product_recommendation.proposals.v1";

function readCollection(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function writeCollection(key, values) {
  window.localStorage.setItem(key, JSON.stringify(values));
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(body.error || "Request failed.");
  }
  return body;
}

export function createPublicShareToken() {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function getLeads() {
  return readCollection(LEADS_KEY);
}

export function saveLead(lead) {
  const leads = getLeads();
  writeCollection(LEADS_KEY, [lead, ...leads.filter((item) => item.lead_id !== lead.lead_id)]);
  return lead;
}

export async function saveLeadRemote(lead) {
  try {
    const body = await requestJson("/api/leads", {
      method: "POST",
      body: JSON.stringify(lead)
    });
    return saveLead(body.lead || lead);
  } catch {
    return saveLead(lead);
  }
}

export function updateLead(leadId, updater) {
  const leads = getLeads();
  let updated = null;
  const nextLeads = leads.map((lead) => {
    if (lead.lead_id !== leadId) return lead;
    updated = updater(lead);
    return updated;
  });
  writeCollection(LEADS_KEY, nextLeads);
  return updated;
}

export async function updateLeadRemote(leadId, updater) {
  const current = getLead(leadId);
  if (!current) return null;
  const next = updater(current);

  try {
    const body = await requestJson("/api/leads", {
      method: "PATCH",
      body: JSON.stringify(next)
    });
    return saveLead(body.lead || next);
  } catch {
    return updateLead(leadId, () => next);
  }
}

export function getLead(leadId) {
  return getLeads().find((lead) => lead.lead_id === leadId) || null;
}

export function getProposals() {
  return readCollection(PROPOSALS_KEY);
}

export function saveProposal(proposal) {
  const proposals = getProposals();
  writeCollection(PROPOSALS_KEY, [proposal, ...proposals.filter((item) => item.proposal_id !== proposal.proposal_id)]);
  return proposal;
}

export async function saveProposalRemote(proposal) {
  try {
    const body = await requestJson("/api/proposals", {
      method: "POST",
      body: JSON.stringify(proposal)
    });
    return saveProposal(body.proposal || proposal);
  } catch {
    return saveProposal(proposal);
  }
}

export function updateProposal(proposalId, updater) {
  const proposals = getProposals();
  let updated = null;
  const nextProposals = proposals.map((proposal) => {
    if (proposal.proposal_id !== proposalId) return proposal;
    updated = updater(proposal);
    return updated;
  });
  writeCollection(PROPOSALS_KEY, nextProposals);
  return updated;
}

export async function updateProposalRemote(proposalId, updater, options = {}) {
  const current = getProposal(proposalId);
  if (!current) return null;
  const next = updater(current);
  const tokenQuery = options.publicToken ? `?token=${encodeURIComponent(options.publicToken)}` : "";

  try {
    const body = await requestJson(`/api/proposals${tokenQuery}`, {
      method: "PATCH",
      body: JSON.stringify(next)
    });
    return saveProposal(body.proposal || next);
  } catch {
    return updateProposal(proposalId, () => next);
  }
}

export function getProposal(proposalId) {
  return getProposals().find((proposal) => proposal.proposal_id === proposalId) || null;
}

export function getProposalByToken(token) {
  return getProposals().find((proposal) => proposal.public_share_token === token) || null;
}

export async function syncWorkflowDataRemote() {
  try {
    const [leadsBody, proposalsBody] = await Promise.all([
      requestJson("/api/leads"),
      requestJson("/api/proposals")
    ]);
    if (Array.isArray(leadsBody.leads)) writeCollection(LEADS_KEY, leadsBody.leads);
    if (Array.isArray(proposalsBody.proposals)) writeCollection(PROPOSALS_KEY, proposalsBody.proposals);
    return {
      leads: Array.isArray(leadsBody.leads) ? leadsBody.leads : getLeads(),
      proposals: Array.isArray(proposalsBody.proposals) ? proposalsBody.proposals : getProposals()
    };
  } catch {
    return {
      leads: getLeads(),
      proposals: getProposals()
    };
  }
}

export async function fetchProposalByTokenRemote(token) {
  try {
    const body = await requestJson(`/api/proposals?token=${encodeURIComponent(token)}`);
    if (body.lead) saveLead(body.lead);
    if (body.proposal) saveProposal(body.proposal);
    return {
      lead: body.lead || null,
      proposal: body.proposal || null
    };
  } catch {
    const proposal = getProposalByToken(token);
    return {
      lead: proposal ? getLead(proposal.lead_id) : null,
      proposal
    };
  }
}
