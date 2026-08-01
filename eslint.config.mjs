import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "build/**", ".next/**", "src/routeTree.gen.ts"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
