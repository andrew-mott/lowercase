import { Ajv } from "ajv";
import type { ValidateFunction } from "ajv";

const ajv = new Ajv({ allErrors: true });
const validatorCache = new Map<string, ValidateFunction>();

function getValidator(schema: Record<string, unknown>): ValidateFunction {
  const key = JSON.stringify(schema);
  const cached = validatorCache.get(key);
  if (cached) return cached;

  const validate = ajv.compile(schema);
  validatorCache.set(key, validate);
  return validate;
}

export function validateExportSchema(
  schema: Record<string, unknown>,
  value: unknown,
): { ok: true } | { ok: false; message: string } {
  const validate = getValidator(schema);
  if (validate(value)) return { ok: true };

  return { ok: false, message: ajv.errorsText(validate.errors) };
}
