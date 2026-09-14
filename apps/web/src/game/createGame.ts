import { CANVAS, Game, Scale } from 'phaser';
import { CafeScene } from './scenes/CafeScene';

export const createGame = (parent: string) => new Game({
  // Canvas keeps this 2D prototype visible on devices where WebGL is unavailable.
  // Phaser's scene and input APIs remain the same when we later choose WebGL for effects.
  type: CANVAS,
  width: window.innerWidth,
  height: window.innerHeight,
  parent,
  backgroundColor: '#1d2030',
  pixelArt: true,
  scene: [CafeScene],
  scale: {
    mode: Scale.RESIZE,
    autoCenter: Scale.CENTER_BOTH,
  },
});
