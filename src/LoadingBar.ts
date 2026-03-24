import Phaser from 'phaser';

const BAR_W = 200;
const BAR_H = 4;

/**
 * Minimal centered loading bar. Add to scene before loading, call update()
 * with progress 0–1, then call remove() when done.
 */
export class LoadingBar {
    private container: Phaser.GameObjects.Container;
    private fill: Phaser.GameObjects.Graphics;
    private track: Phaser.GameObjects.Graphics;
    private scene: Phaser.Scene;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        this.container = scene.add.container(centerX, centerY);
        this.container.setDepth(10000);

        this.track = scene.add.graphics();
        this.track.fillStyle(0xffffff, 0.2);
        this.track.fillRoundedRect(-BAR_W / 2, -BAR_H / 2, BAR_W, BAR_H, BAR_H / 2);

        this.fill = scene.add.graphics();

        this.container.add([this.track, this.fill]);
        this._draw(0);
    }

    update(progress: number): void {
        this._draw(Math.min(1, Math.max(0, progress)));
    }

    remove(): void {
        this.container.destroy();
    }

    private _draw(p: number): void {
        const w = Math.max(BAR_H, BAR_W * p);
        this.fill.clear();
        this.fill.fillStyle(0xffffff, 0.9);
        this.fill.fillRoundedRect(-BAR_W / 2, -BAR_H / 2, w, BAR_H, BAR_H / 2);
    }
}
