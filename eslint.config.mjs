import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
const { node: nodeGlobals, jest: jestGlobals } = globals;

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...nodeGlobals, ...jestGlobals },
    },
    ignores: ['.eslintrc.js', 'dist', 'node_modules', 'eslint.config.js', 'eslint.config.mjs'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'warn',
      'no-var': 'error',
    },
  },
  {
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
);
