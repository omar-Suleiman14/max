import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['Max-*/**', '.cache/**', '.npm-cache/**', '.vite/**', 'coverage/**', 'dist/**', 'node_modules/**', 'out/**', 'worker/**'],
  },
  eslint.configs.recommended,
  {
    files: ['scripts/**/*.cjs', 'scripts/**/*.mjs', 'forge.config.cjs'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        AbortSignal: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        require: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    files: ['site/**/*.js'],
    languageOptions: {
      globals: {
        document: 'readonly',
        fetch: 'readonly',
        navigator: 'readonly',
        sessionStorage: 'readonly',
        window: 'readonly',
      },
    },
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
  })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'better-sqlite3', 'node:*'],
              message: 'Renderer code must use the typed window.maxApi bridge.',
            },
            {
              group: ['../main/**', '../../main/**', '../../../main/**'],
              message: 'Renderer code cannot import Electron main-process modules.',
            },
          ],
        },
      ],
    },
  },
);
