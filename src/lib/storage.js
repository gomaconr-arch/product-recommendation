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

export function getProposal(proposalId) {
  return getProposals().find((proposal) => proposal.proposal_id === proposalId) || null;
}

export function getProposalByToken(token) {
  return getProposals().find((proposal) => proposal.public_share_token === token) || null;
}
