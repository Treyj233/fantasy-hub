import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    // Archived generated bundles kept temporarily so cached native WebViews
    // can recover after a deployment replaced their hashed entry assets.
    "public/assets/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
