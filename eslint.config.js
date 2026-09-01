import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },

  js.configs.recommended,
  ...tseslint.configs.strict,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.es2022 },
    },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      // `unknown` at boundaries, narrowed by a Zod parse. There is no allowlist;
      // a genuine escape needs @ts-expect-error with a written reason, which is
      // visible in review.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Model output is untrusted input. It renders to a React tree, never HTML.
      'react/no-danger': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
          message: 'Model output is untrusted. Render to a React tree instead.',
        },
        {
          selector: 'JSXAttribute[name.name="style"]:not([value.expression.type="Identifier"])',
          message:
            'Inline styles bypass the token system. Use a token-backed utility, or a CSS custom property when the value is computed.',
        },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // Provider-specific behaviour belongs in a backend adapter, never in the UI.
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    ignores: ['frontend/src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
          message: 'Model output is untrusted. Render to a React tree instead.',
        },
        {
          selector:
            "Literal[value=/^(openai|anthropic|google|gemini|mistral|deepseek|groq|nvidia|openrouter)$/i]",
          message:
            'Provider identifiers must come from the model catalog, not be hardcoded in the UI.',
        },
      ],
    },
  },

  // Tests assert against dynamic JSON response bodies and narrow known-present
  // values. The bans stay in force everywhere under src/.
  {
    files: ['**/*.test.{ts,tsx}', '**/tests/**/*.{ts,tsx}', '**/vitest.setup.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    files: ['**/*.config.{ts,js}', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },

  // Build-time scripts run in Node and report to the terminal.
  {
    files: ['**/scripts/**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
);
