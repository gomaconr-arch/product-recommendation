import Ajv from "ajv";
import { matchingInputSchema, pivotRulesSchema, productsSchema } from "./schemas.js";

const ajv = new Ajv({ allErrors: true });

function assertValid(schema, value, label) {
  const validate = ajv.compile(schema);
  if (!validate(value)) {
    const details = validate.errors
      .map((error) => `${error.instancePath || "/"} ${error.message}`)
      .join("; ");
    throw new Error(`${label} failed schema validation: ${details}`);
  }
}

export function validateMatchingInput(value) {
  assertValid(matchingInputSchema, value, "Matching input");
}

export function validateProducts(value) {
  assertValid(productsSchema, value, "Products");
}

export function validatePivotRules(value) {
  assertValid(pivotRulesSchema, value, "Pivot rules");
}
