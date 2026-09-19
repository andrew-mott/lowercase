import { Ajv2020 } from "ajv/dist/2020.js";

// One AJV instance for every schema in this package, which is how AJV expects
// to be used: a schema compiled here can $ref another by its $id. `allErrors`
// reports every problem rather than the first, and `verbose` puts each failing
// value and subschema on its error, which schemaIssues reads.
export const ajv = new Ajv2020({ allErrors: true, verbose: true });
