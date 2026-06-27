import { adaptRawAssessmentToMatchInput, createLeadFromRawAssessment } from "./rawAssessmentAdapter.js";
import { getRecommendations } from "./matchEngine.js";
import { validateIntakeMatchingInput, validateIntakePivotRules, validateIntakeProducts } from "./intakeValidation.js";

function stringifyJson(value) {
  return JSON.stringify(value);
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getAgentField(rawPayload, key) {
  return cleanString(rawPayload?.agent?.[key]) ||
    cleanString(rawPayload?.agentInfo?.[key]) ||
    cleanString(rawPayload?.quoteData?.[key]) ||
    cleanString(rawPayload?.[key]);
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function toLeadRecord(lead, rawPayload) {
  return {
    id: lead.lead_id,
    agent_slug: getAgentField(rawPayload, "agent_slug") || getAgentField(rawPayload, "agentSlug") || lead.agent_id || null,
    agent_name: getAgentField(rawPayload, "agent_name") || getAgentField(rawPayload, "agentName") || null,
    name: lead.name,
    email: lead.email || null,
    phone: lead.phone || null,
    age: lead.age,
    consent: lead.consent ? 1 : 0,
    raw_assessment_json: stringifyJson(rawPayload),
    created_at: lead.created_at
  };
}

async function insertLead(db, leadRecord) {
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
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      leadRecord.id,
      leadRecord.agent_slug,
      leadRecord.agent_name,
      leadRecord.name,
      leadRecord.email,
      leadRecord.phone,
      leadRecord.age,
      leadRecord.consent,
      leadRecord.raw_assessment_json,
      leadRecord.created_at
    )
    .run();
}

async function insertRecommendation(db, recommendationRecord) {
  await db
    .prepare(
      `INSERT INTO recommendations (
        id,
        lead_id,
        matching_input_json,
        recommendation_result_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      recommendationRecord.id,
      recommendationRecord.lead_id,
      recommendationRecord.matching_input_json,
      recommendationRecord.recommendation_result_json,
      recommendationRecord.created_at
    )
    .run();
}

async function insertIntakeLog(db, logRecord) {
  await db
    .prepare(
      `INSERT INTO intake_logs (
        id,
        lead_id,
        status,
        error_message,
        request_json,
        response_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      logRecord.id,
      logRecord.lead_id,
      logRecord.status,
      logRecord.error_message,
      logRecord.request_json,
      logRecord.response_json,
      logRecord.created_at
    )
    .run();
}

export async function processAssessmentIntake({ rawPayload, db, products, pivotRules, agentId = null }) {
  if (!db) {
    throw new Error("D1 database binding DB is not configured.");
  }

  validateIntakeProducts(products);
  validateIntakePivotRules(pivotRules);

  const createdAt = new Date().toISOString();
  const lead = createLeadFromRawAssessment(rawPayload, agentId);
  const leadRecord = toLeadRecord(lead, rawPayload);
  const matchingInput = adaptRawAssessmentToMatchInput(rawPayload);
  validateIntakeMatchingInput(matchingInput);

  const recommendationResult = getRecommendations(matchingInput, products, pivotRules);
  const recommendationRecord = {
    id: createId("rec"),
    lead_id: leadRecord.id,
    matching_input_json: stringifyJson(matchingInput),
    recommendation_result_json: stringifyJson(recommendationResult),
    created_at: createdAt
  };
  const response = {
    ok: true,
    leadId: leadRecord.id,
    recommendationId: recommendationRecord.id
  };

  await insertLead(db, leadRecord);
  await insertRecommendation(db, recommendationRecord);
  await insertIntakeLog(db, {
    id: createId("log"),
    lead_id: leadRecord.id,
    status: "success",
    error_message: null,
    request_json: stringifyJson(rawPayload),
    response_json: stringifyJson(response),
    created_at: createdAt
  });

  return {
    response,
    lead: leadRecord,
    matchingInput,
    recommendationResult
  };
}

export async function logFailedAssessmentIntake({ db, rawPayload, errorMessage }) {
  if (!db) return;

  await insertIntakeLog(db, {
    id: createId("log"),
    lead_id: null,
    status: "error",
    error_message: errorMessage,
    request_json: rawPayload === undefined ? null : stringifyJson(rawPayload),
    response_json: stringifyJson({ ok: false, error: errorMessage }),
    created_at: new Date().toISOString()
  });
}
