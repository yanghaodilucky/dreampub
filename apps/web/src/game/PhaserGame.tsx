import { useLayoutEffect, useRef } from 'react';
import type { Game } from 'phaser';
import { createGame } from './createGame';

export function PhaserGame() {
  const gameRef = useRef<Game | null>(null);

  useLayoutEffect(() => {
    gameRef.current = createGame('game-container');
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div id="game-container" aria-label="DreamPub 像素图书馆" />;
}
