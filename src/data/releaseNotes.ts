/**
 * Notas das atualizações do jogo (mudanças no código). A tela inicial as mostra em "Novidades", junto das notas que o
 * administrador publica. A cada atualização do jogo, acrescente uma entrada no começo da lista.
 */
export interface ReleaseNote {
  /** Dia da atualização, no formato AAAA-MM-DD. */
  readonly date: string;
  readonly title: string;
  readonly changes: readonly string[];
}

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    date: '2026-11-28',
    title: 'Mapas, torres novas e como assistir às outras lutas',
    changes: [
      'Mapas: Escritório, Praia, Vulcão, Campo e Lua, sorteados ou escolhidos por quem cria a sala.',
      'Durante o combate, toque no nome de outro jogador para ver a luta dele. Quem foi eliminado acompanha quem quiser, quando quiser.',
      'Torres personalizadas com bônus para os aliados (criadas e ligadas no painel).',
      'Terrenos: habilidades podem deixar casas com efeito no chão. O Wilian agora deixa um "Cantinho da soneca" que atrasa quem passa.',
      'Bixo, ao descansar, também protege os aliados que estão perto.',
      'Matheus ganhou chance de envenenar no ataque comum.',
      'Helder passou a ser comum e Wender, raro.',
      'Música de combate mais intensa e sons novos para golpes, dano e outros momentos.',
      'A tela de personagens mostra o elenco publicado no servidor.',
    ],
  },
  {
    date: '2026-11-26',
    title: 'Ajustes de equilíbrio',
    changes: ['João Lucas e Moço ficaram mais fortes.', 'Atualizar a loja custa 1 moeda.', 'A vantagem do primeiro lugar no sorteio dos duelos foi corrigida.', 'A torre foi refeita.'],
  },
];
