import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      'dist/',
      'coverage/',
      'playwright-report/',
      'test-results/',
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
  { linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' } },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: tseslint.configs.recommendedTypeChecked,
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json', './tsconfig.tests.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-check': false, 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
          message: '`as unknown as` esconde o tipo: valide o dado com um type guard.',
        },
      ],
    },
  },
  {
    files: ['src/ui/dialog-motion.ts'],
    rules: { '@typescript-eslint/unbound-method': 'off' },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { disallowTypeAnnotations: false }],
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['eslint.config.mjs', 'jest.config.mjs', 'playwright.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  prettierConfig,
);
