import Phaser from 'phaser';
import { SpinePlugin } from 'zimporter-phaser';
import { Game } from './Game';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#000000',
  parent: 'game-container',
  scene: [Game],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  plugins: {
    scene: [
      {
        key: 'SpinePlugin',
        plugin: SpinePlugin,
        mapping: 'spine'
      }
    ]
  }
};

const game = new Phaser.Game(config);
(globalThis as any).__PHASER_GAME__ = game;

window.addEventListener('resize', () => {
  const scene = game.scene.getScene('GameScene') as Game | null;
  if (scene) {
    scene.resize(window.innerWidth, window.innerHeight);
  }
});

