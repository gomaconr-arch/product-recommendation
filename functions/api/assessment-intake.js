import products from "../../data/products.json";
import pivotRules from "../../data/pivot-rules.json";
import { logFailedAssessmentIntake, processAssessmentIntake } from "../../src/lib/intakeService.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Assessment-Secret"
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS
    }
  });
}

function isAuthorized(request, env) {
  const secret = env.ASSESSMENT_INTAKE_SECRET;
  if (!secret) return true;
  return request.headers.get("X-Assessment-Secret") === secret;
}

function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

async function handlePost({ request, env }) {
  let rawPayload;

  try {
    if (!isAuthorized(request, env)) {
      return jsonResponse({ ok: false, error: "Invalid assessment intake secret." }, 401);
    }

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return jsonResponse({ ok: false, error: "Content-Type must be application/json." }, 415);
    }

    rawPayload = await request.json();
    const { response } = await processAssessmentIntake({
      rawPayload,
      db: env.DB,
      products,
      pivotRules
    });

    return jsonResponse(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Assessment intake failed.";
    await logFailedAssessmentIntake({
      db: env.DB,
      rawPayload,
      errorMessage
    }).catch(() => undefined);

    return jsonResponse({ ok: false, error: errorMessage }, 400);
  }
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return optionsResponse();
  if (context.request.method === "POST") return handlePost(context);
  return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
}
