import Phaser from 'phaser';
import { ZScene, ZTimeline } from 'zimporter-phaser';
import { GlobalData } from './GlobalData';
import { LoadingBar } from './LoadingBar';
import { StoryLoader } from './StoryLoader';

export class SplashScreen {
    private scene: ZScene;
    private phaserScene: Phaser.Scene;
    private onComplete: () => void;

    constructor(phaserScene: Phaser.Scene, onComplete: () => void) {
        this.phaserScene = phaserScene;
        this.onComplete = onComplete;
        this.scene = new ZScene('splash', phaserScene);
    }

    async load(): Promise<void> {
        const bar = new LoadingBar(this.phaserScene);
        // Load splash scene visuals and story XML simultaneously
        await Promise.all([
            new Promise<void>(resolve => {
                this.scene.load(`${GlobalData.assetsBasePath}Splash/`, () => {
                    bar.remove();
                    resolve();
                });
            }),
            StoryLoader.load(GlobalData.currentLang),
        ]);

        this.scene.loadStage(this.phaserScene);

        // Auto-play any timeline animations in the splash scene
        const children = this.scene.sceneStage.list as any[];
        for (const child of children) {
            if (child instanceof ZTimeline) {
                (child as ZTimeline).play();
            }
        }

        // Show splash for 2 s, then signal Game to begin the next scene.
        // Destruction is deferred to Game.ts so the splash stays visible
        // while the next scene is loading.
        setTimeout(() => { this.onComplete(); }, 2000);
    }

    /** Called by Game.ts after the next scene has finished loading. */
    destroy(): void {
        // Only remove and destroy the display objects — calling scene.destroy()
        // may spawn internal async tasks.
        if (this.scene.sceneStage.parentContainer) {
            this.scene.sceneStage.parentContainer.remove(this.scene.sceneStage);
        }
        this.scene.sceneStage.destroy();
    }
}
