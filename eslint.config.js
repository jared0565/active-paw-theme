// Flat config for the Aramid gate, which runs node_modules/.bin/eslint -f json on
// every changed JavaScript file. Keep it small: recommended rules, the right
// globals per file kind, and the generated or vendored trees left out.
const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: [
      "node_modules/**",
      "output/**",
      "graph-out/**",
      "pawscout-worker/**",
      "test-results/**",
      ".playwright-mcp/**",
      ".cache/**",
      // Vendored QR Code Generator (Kazuhiko Arase); upstream style, not ours to lint.
      "assets/qrcode.js",
    ],
  },
  js.configs.recommended,
  {
    // Theme assets are plain browser scripts loaded by layout/theme.liquid:
    // no modules, no bundler, no build step.
    files: ["assets/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: { ...globals.browser },
    },
    rules: {
      // The theme swallows storage and beacon failures on purpose
      // (`catch (error) { /* nothing to persist */ }`); the binding is
      // kept for readability, so do not report it as unused.
      "no-unused-vars": ["error", { caughtErrors: "none" }],
    },
  },
  {
    // This config file itself is CommonJS.
    files: ["eslint.config.js"],
    languageOptions: { sourceType: "commonjs", globals: { ...globals.node } },
  },
  {
    // Node-side helpers at the repo root (Playwright renders, verdict scripts).
    files: ["**/*.cjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
];
