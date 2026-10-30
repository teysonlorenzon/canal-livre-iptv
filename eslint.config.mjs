import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/',
      'apps/tv-webos/dist/',
      'apps/tv-webos/out/',
      'apps/desktop/app/',
      'apps/desktop/out/',
      'apps/mobile/www/',
      'apps/mobile/android/',
      'apps/mobile/ios/',
      '.claude/',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'apps/*/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: { ...globals.browser, Hls: 'readonly', mpegts: 'readonly', webOS: 'readonly', Capacitor: 'readonly' },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-assignment': 'warn',
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.node },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['**/*.mjs', '**/*.cjs'],
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  prettierConfig,
];
