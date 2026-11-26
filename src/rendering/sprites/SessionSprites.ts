import Phaser from 'phaser';
import type { SpriteSource } from '@core/game/MatchSession';
import { appearanceOfSource, spriteTextureKey, type SpriteAppearance } from './spriteRegistry';

/**
 * Imagens de uma partida. São baixadas em segundo plano: a tela (e a loja) aparece na hora com o boneco provisório e
 * troca pelas imagens quando elas chegam, em vez de ficar parada enquanto o cronômetro da preparação corre.
 */
export class SessionSprites {
  private readonly appearances = new Map<string, SpriteAppearance>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sources: readonly SpriteSource[],
    private readonly onArrived: () => void,
  ) {}

  load(): void {
    this.register();
    const missing = this.sources.filter((source) => !this.scene.textures.exists(spriteTextureKey(source.url)));
    if (missing.length === 0) {
      return;
    }
    this.scene.load.crossOrigin = 'anonymous';
    missing.forEach((source) => this.scene.load.image(spriteTextureKey(source.url), source.url));
    this.scene.load.once(Phaser.Loader.Events.COMPLETE, this.handleArrival, this);
    this.scene.load.start();
  }

  appearanceOf(spriteId: string | null): SpriteAppearance | undefined {
    return spriteId === null ? undefined : this.appearances.get(spriteId);
  }

  destroy(): void {
    this.scene.load.off(Phaser.Loader.Events.COMPLETE, this.handleArrival, this);
  }

  /** Só entram as imagens que carregaram; as que faltam (ou falharam) ficam com o boneco provisório. */
  private register(): void {
    for (const source of this.sources) {
      if (this.scene.textures.exists(spriteTextureKey(source.url))) {
        this.appearances.set(source.characterId, appearanceOfSource(source));
      }
    }
  }

  private handleArrival(): void {
    this.register();
    this.onArrived();
  }
}
