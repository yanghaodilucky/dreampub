import { CANVAS, Game, Scale } from 'phaser';
import { LibraryScene } from './scenes/LibraryScene';

export const createGame = (parent: string) => new Game({
  // Canvas keeps this 2D prototype visible on devices where WebGL is unavailable.
  // Phaser's scene and input APIs remain the same when we later choose WebGL for effects.
  type: CANVAS,
  width: 960,
  height: 600,
  parent,
  backgroundColor: '#1d2030',
  pixelArt: true,
  scene: [LibraryScene],
  scale: {
    mode: Scale.FIT,
    autoCenter: Scale.CENTER_BOTH,
  },
});
