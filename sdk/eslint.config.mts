// @ts-check

import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  eslint.configs.all,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  eslintConfigPrettier,
  {
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/no-deprecated": "error",
    },
    ignores: ["dist", "node_modules"],
  },
);
