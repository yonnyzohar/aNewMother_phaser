import Phaser from 'phaser';
import { ZScene, ZSceneStack, ZButton } from 'zimporter-phaser';
import { GlobalData } from './GlobalData';

export class AboutScreen {
    private scene: ZScene;
    private phaserScene: Phaser.Scene;
    private onClose: () => void;

    constructor(phaserScene: Phaser.Scene, onClose: () => void) {
        this.phaserScene = phaserScene;
        this.onClose = onClose;
        this.scene = new ZScene('about', phaserScene);
    }

    async load(): Promise<void> {
        await new Promise<void>(resolve => {
            this.scene.load(`${GlobalData.assetsBasePath}about/`, () => resolve());
        });

        ZSceneStack.push(this.scene);
        this.scene.loadStage(this.phaserScene);

        const L = GlobalData.labels;
        const ss = this.scene.sceneStage;

        ss.get('aboutTopTitleTXT')?.setText(L['about'] ?? 'About');
        ss.get('myText')?.setText(L['aboutcontents'] ?? '');

        const xBtn = ss.get('xButton') as ZButton | null;
        if (xBtn) {
            xBtn.setCallback(() => this._close());
        }
    }

    private _close(): void {
        const xBtn = this.scene.sceneStage.get('xButton') as ZButton | null;
        xBtn?.removeCallback();

        GlobalData.playUiSound('xClose.mp3');
        ZSceneStack.pop();
        if (this.scene.sceneStage.parentContainer) {
            this.scene.sceneStage.parentContainer.remove(this.scene.sceneStage);
        }
        this.scene.destroy();
        this.onClose();
    }
}
