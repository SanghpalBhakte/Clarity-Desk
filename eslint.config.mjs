// Strict lint for the app files. Existing violations are recorded in
// eslint-suppressions.json (ESLint bulk suppressions), so only new ones fail.
// After fixing old ones: npx eslint --prune-suppressions
import globals from 'globals';
import js from '@eslint/js';
import fs from 'node:fs';

// Functions app.js hangs on window (window.foo = ...) are called bare from
// inline handlers and other functions; treat them as known globals so
// no-undef still catches real typos.
const windowFns = Object.fromEntries(
  [...fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8').matchAll(/^\s*window\.([A-Za-z_$][\w$]*)\s*=/gm)]
    .map((m) => [m[1], 'readonly'])
);

const banned = [
  { selector: "CallExpression[callee.name=/^(confirm|alert|prompt)$/]", message: 'Use appConfirm / a toast, never a native dialog (PR #183).' },
  { selector: "CallExpression[callee.property.name=/^(confirm|alert|prompt)$/][callee.object.name='window']", message: 'Use appConfirm / a toast, never a native dialog (PR #183).' },
  { selector: "CallExpression[callee.property.name='slice'][callee.object.callee.property.name='toISOString']", message: 'toISOString() is UTC: before 5:30 AM IST it gives yesterday. Use the local date helper.' },
  { selector: "MemberExpression[object.callee.property.name='split'][object.callee.object.callee.property.name='toISOString']", message: 'toISOString() is UTC: before 5:30 AM IST it gives yesterday. Use the local date helper.' },
  { selector: "MemberExpression[object.name='localStorage'][property.name=/^(getItem|setItem|removeItem)$/]", message: 'Use safeGetStorage / safeSetStorage so storage errors and bad JSON are handled in one place.' },
];

const strict = {
  ...js.configs.recommended.rules,
  'no-undef': 'error',
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-shadow': 'error',
  'no-var': 'error',
  'prefer-const': 'error',
  'no-implicit-globals': 'error',
  'no-restricted-syntax': ['error', ...banned],
};

export default [
  {
    ignores: ['node_modules/**', 'tests/**', 'scripts/**', 'ai-proxy/**', 'firebase-config.local.example.js', 'motion/**', 'docs/**', 'test-results/**', 'playwright-report/**'],
  },
  {
    files: ['*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, ...windowFns, firebase: 'readonly', process: 'readonly' } },
    rules: strict,
  },
  {
    files: ['sw.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.serviceworker } },
  },
  {
    files: ['firebase-config.js'],
    languageOptions: { sourceType: 'script' },
    rules: { 'no-implicit-globals': 'off' },
  },
];
