/* ESLint flat config (ESLint 9). Focused on correctness + hooks safety rather
   than style (Prettier owns formatting). Noisy-but-benign rules are relaxed so
   `npm run lint` stays a useful signal on this existing codebase. */

import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'legacy/**'] },

  js.configs.recommended,

  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2023 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...react.configs.recommended.rules,

      // Only the two classic hooks rules — the v7 plugin also ships experimental
      // React-Compiler rules (purity/use-memo/…) that are too strict for this
      // hand-optimised codebase, so we opt into just the ones that catch bugs.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // The app uses the new JSX transform (no React import needed) and reads
      // design tokens off a module singleton, so these add noise, not value.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-unknown-property': 'off',

      // Fast-refresh friendliness: warn, don't fail the build on mixed exports.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Allow intentionally-unused args prefixed with _ and caught errors.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // Test files run under Vitest globals.
  {
    files: ['src/**/*.{test,spec}.{js,jsx}', 'src/test/**'],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
];
