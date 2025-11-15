import js from '@eslint/js';
import globals from 'globals';
import vueParser from 'vue-eslint-parser';
import tsParser from '@typescript-eslint/parser';
import pluginVue from 'eslint-plugin-vue';
import tseslintPlugin from '@typescript-eslint/eslint-plugin';
import pluginImport from 'eslint-plugin-import';
import pluginPrettier from 'eslint-plugin-prettier';

const browserGlobals = Object.fromEntries(Object.entries(globals.browser).map(([key, value]) => [key.trim(), value]));
const nodeGlobals = Object.fromEntries(Object.entries(globals.node).map(([key, value]) => [key.trim(), value]));

export default [
  {
    ignores: ['src/sora/**'],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.{js,ts,vue}'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 2020,
        sourceType: 'module',
      },
      globals: {
        ...browserGlobals,
        ...nodeGlobals,
        chrome: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslintPlugin,
      import: pluginImport,
      prettier: pluginPrettier,
    },
    rules: {
      'no-console': [process.env.NODE_ENV === 'production' ? 'error' : 'warn', { allow: ['warn', 'error', 'info'] }],
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
      'no-use-before-define': 'off',
      'no-redeclare': 'off',
      'no-unused-vars': 'off',
      'import/order': [
        'warn',
        { groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object', 'type'] },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/store',
              message: 'Vuex entry points were removed; import Pinia stores via @/stores instead.',
            },
          ],
          patterns: [
            {
              group: ['@/store/*'],
              message: 'Legacy Vuex modules have been deleted; point to Pinia stores under src/stores/**.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='$state']",
          message: 'Use store.$patch() or actions instead of mutating Pinia $state directly.',
        },
      ],
      'prettier/prettier': ['error', { endOfLine: 'lf' }],
      '@stylistic/semi': 'off',
      '@stylistic/comma-dangle': 'off',
      '@stylistic/space-before-function-paren': 'off',
      'no-undef': 'off',
      'no-constant-binary-expression': 'off',
      'no-void': 'off',
      curly: 'off',
      'object-shorthand': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'vue/html-closing-bracket-newline': [
        'error',
        {
          singleline: 'never',
          multiline: 'always',
        },
      ],
      'vue/define-props-declaration': 'off',
      'vue/valid-define-props': 'off',
      'vue/html-indent': ['warn', 2],
      'vue/block-spacing': 1,
      'vue/multi-word-component-names': 'off',
      'padding-line-between-statements': 'off',
    },
  },
  {
    files: ['**/*.vue'],
    rules: {
      'no-undef': 'off',
    },
  },
  {
    files: ['**/__tests__/*.{j,t}s?(x)', '**/tests/unit/**/*.spec.{j,t}s?(x)'],
    languageOptions: {
      globals: globals.jest,
    },
  },
];
