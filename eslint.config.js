import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.wrangler/**',
    ],
  },
  ...tseslint.configs.strict,
  {
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      // The engine is a pure fold over (seed, actions): ambient time or randomness
      // would break replay determinism.
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random' },
        { object: 'Date', property: 'now' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'No ambient time in the engine.',
        },
        { selector: 'ThrowStatement', message: 'Engine never throws — return Result errors.' },
      ],
    },
  },
);
