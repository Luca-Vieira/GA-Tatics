import tseslint from 'typescript-eslint';

const importsProibidosNaSimulacao = {
  patterns: [
    {
      group: ['phaser', 'phaser/*', 'firebase', 'firebase/*', '@rendering/*', '@multiplayer/*', '@admin/*'],
      message: 'core, combat e shared são lógica pura: não podem depender de Phaser, Firebase, renderização, multiplayer ou admin.',
    },
  ],
};

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/core/**/*.ts', 'src/combat/**/*.ts', 'src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', importsProibidosNaSimulacao],
    },
  },
);
