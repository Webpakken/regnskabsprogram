import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      /**
       * React Hooks v7 «compiler»-regler: for strenge til eksisterende kode (data i useEffect,
       * Date.now i render m.m.) uden større refaktor. Holdes slået fra indtil evt. gradvis løft.
       */
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      /** Kontekst + hooks i samme fil er almindeligt; fast refresh er ikke kritisk i CI. */
      'react-refresh/only-export-components': 'warn',
    },
  },
])
