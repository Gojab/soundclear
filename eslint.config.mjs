import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: [
      'dist/**/*',
      'dev-dist/**/*',
      'backend/**/*',
      'node_modules/**/*',
      'mobile-android/**/*',
      'desktop-windows/**/*',
    ],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
