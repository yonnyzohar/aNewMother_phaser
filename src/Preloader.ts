import Phaser from 'phaser';

/**
 * A centered spinning-arc preloader with a full-screen semi-transparent
 * overlay that blocks all pointer events (disabling buttons behind it).
 *
 * Usage:
 *   const p = new Preloader(scene);
 *   p.show();           // add to scene on top, start spinning
 *   await something();
 *   p.hide();           // remove from scene, stop spinning
 */
export class Preloader {
    private container: Phaser.GameObjects.Container;
    private spinner: Phaser.GameObjects.Graphics;
    private overlay: Phaser.GameObjects.Graphics;
    private scene: Phaser.Scene;
    private angle = 0;
    private updateEvent: Phaser.Time.TimerEvent | null = null;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.container = scene.add.container(0, 0);
        this.container.setDepth(10000);

        // Full-screen overlay — blocks ALL pointer events while visible.
        const W = window.innerWidth;
        const H = window.innerHeight;
        this.overlay = scene.add.graphics();
        this.overlay.fillStyle(0x000000, 0.45);
        this.overlay.fillRect(0, 0, W, H);
        this.overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, W, H), Phaser.Geom.Rectangle.Contains);
        
        // Spinner arc drawn each update.
        this.spinner = scene.add.graphics();

        this.container.add([this.overlay, this.spinner]);
        this.container.setVisible(false);
    }

    /** Add the overlay+spinner to the scene (always as the top-most element). */
    show(): void {
        this.container.setVisible(true);
        this.container.bringToTop(this.overlay);
        this.container.bringToTop(this.spinner);

        if (!this.updateEvent) {
            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;
            this._draw(cx, cy); // draw immediately so it's visible before first update
            this.updateEvent = this.scene.time.addEvent({
                delay: 16, // ~60 fps
                callback: () => {
                    this.angle += 0.07;
                    this._draw(cx, cy);
                },
                loop: true
            });
        }
    }

    /** Remove the overlay+spinner from the scene and stop the animation. */
    hide(): void {
        if (this.updateEvent) {
            this.updateEvent.remove();
            this.updateEvent = null;
        }
        this.container.setVisible(false);
    }

    private _draw(cx: number, cy: number): void {
        const r = 38;
        const g = this.spinner;
        g.clear();

        // Dim full ring as the "track".
        g.lineStyle(7, 0xffffff, 0.2);
        g.strokeCircle(cx, cy, r);

        // Bright spinning arc (≈ 250° of the circle).
        g.lineStyle(7, 0xffffff, 1);
        g.beginPath();
        g.arc(cx, cy, r, this.angle, this.angle + Math.PI * 1.4, false);
        g.strokePath();
    }
}
