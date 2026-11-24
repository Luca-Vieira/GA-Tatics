import Phaser from 'phaser';

const TRANSIENT_KEY = 'transientEffect';

/** Marca um objeto de efeito de curta duração (texto flutuante, projétil, anel) para poder removê-lo se o combate acabar antes. */
export function markTransient<Item extends Phaser.GameObjects.GameObject>(item: Item): Item {
  item.setData(TRANSIENT_KEY, true);
  return item;
}

/** Destrói todos os efeitos de curta duração que ainda estejam na cena. */
export function destroyTransientEffects(scene: Phaser.Scene): void {
  const leftovers = scene.children.list.filter((item) => item.getData(TRANSIENT_KEY) === true);
  leftovers.forEach((item) => item.destroy());
}
