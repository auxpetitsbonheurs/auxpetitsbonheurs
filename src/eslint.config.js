import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["build/", ".react-router/", ".wrangler/", "node_modules/", "worker-configuration.d.ts", "drizzle/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Server-only code (*.server.ts, .server/ folders, app/server) must never reach the
    // browser bundle (NFR-003). Route modules may import it in loaders/actions (React
    // Router strips those); UI and shared isomorphic code may not.
    files: [
      "app/components/**/*.{ts,tsx}",
      "app/features/**/*.{ts,tsx}",
      "app/welcome/**/*.{ts,tsx}",
      "app/domain/**/*.{ts,tsx}",
      "app/lib/**/*.{ts,tsx}",
      "app/i18n/**/*.{ts,tsx}",
      "**/*.client.{ts,tsx}",
    ],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/*.server", "**/*.server.*", "**/.server/**", "~/server/**", "**/server/*"],
              message: "server-only module: import it from a route loader/action or app/server, never from client code.",
            },
          ],
        },
      ],
    },
  },
);
