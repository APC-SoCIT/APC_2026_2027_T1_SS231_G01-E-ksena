
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions runs on Deno and follows its rules, not the app's.
    ignores: ['dist/*', 'supabase/functions/*'],
  },
]);