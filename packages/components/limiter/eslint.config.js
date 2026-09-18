import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // coverage/ is gitignored istanbul output; linting generated files reports
  // problems in code nobody here can edit.
  globalIgnores(["dist", "coverage"]),
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      // underscore-prefixed params are a deliberate "intentionally unused"
      // signal in test fakes (e.g. `vi.fn(async (_grantId: string) => {})`).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],
    },
  },
]);
