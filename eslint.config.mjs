import importPlugin from 'eslint-plugin-import'
import eslint from '@eslint/js'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      '**/dist/',
      'eslint.config.mjs',
      'website/.astro/**/*',
      '.aws-sam/**',
    ],
  },

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.js'],
          defaultProject: './tsconfig.json',
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },

  // Browser globals for website folder
  {
    files: ['website/**/*'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  eslint.configs.recommended,
  importPlugin.flatConfigs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylisticTypeChecked,
  ...tseslint.configs.strictTypeChecked,
  eslintPluginReact.configs.flat.recommended,
  {
    rules: {
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          caughtErrors: 'none',
        },
      ],
      'no-underscore-dangle': 0,
      curly: 'error',
      'no-empty': 'off',
      // 'no-console': [
      //   'error',
      //   {
      //     allow: ['error', 'warn'],
      //   },
      // ],
      semi: ['error', 'never'],

      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-base-to-string': 'off',

      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/restrict-plus-operands': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',

      'import/no-unresolved': 'off',
      'import/no-cycle': 'error',
      'import/extensions': ['error', 'ignorePackages'],

      'import/order': [
        'error',
        {
          named: true,
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
          },
          groups: [
            'builtin',
            ['external', 'internal'],
            ['parent', 'sibling', 'index', 'object'],
            'type',
          ],
          pathGroups: [
            {
              group: 'builtin',
              pattern: 'react',
              position: 'before',
            },
            {
              group: 'external',
              pattern: '@mui/icons-material',
              position: 'after',
            },
          ],

          pathGroupsExcludedImportTypes: ['react'],
        },
      ],
    },
  },
)
