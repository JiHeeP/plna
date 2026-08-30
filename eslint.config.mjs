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
    "dashboard/.next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 데스크톱 위젯을 빌드하면 생기는 러스트/타우리 산출물 (git 에도 올리지 않는다).
    "desktop-widget/src-tauri/target/**",
    "desktop-widget/src-tauri/gen/**",
  ]),
]);

export default eslintConfig;
