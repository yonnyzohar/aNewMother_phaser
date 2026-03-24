import Phaser from 'phaser';
import { ZScene, ZSceneStack, ZButton} from 'zimporter-phaser';
import { GlobalData } from './GlobalData';
import { LoadingBar } from './LoadingBar';
import { StoryLoader } from './StoryLoader';

export class MainMenu {
    private scene: ZScene;
    private phaserScene: Phaser.Scene;
    private onPlay: () => void;
    private onAbout: () => void;
    private onLangChange: (lang: string) => void;

    constructor(
        phaserScene: Phaser.Scene,
        onPlay: () => void,
        onAbout: () => void,
        onLangChange: (lang: string) => void,
    ) {
        this.phaserScene = phaserScene;
        this.onPlay = onPlay;
        this.onAbout = onAbout;
        this.onLangChange = onLangChange;
        this.scene = new ZScene('mainMenu', phaserScene);
    }

    async load(): Promise<void> {
        const bar = new LoadingBar(this.phaserScene);
        await new Promise<void>(resolve => {
            this.scene.load(`${GlobalData.assetsBasePath}mainMenu/`, () => {
                bar.remove();
                resolve();
            });
        });

        ZSceneStack.push(this.scene);
        this.scene.loadStage(this.phaserScene);
        this._applyLabels();
    }

    /** Re-apply labels + re-create overlay after a language switch. */
    async reload(): Promise<void> {
        await StoryLoader.load(GlobalData.currentLang);
        this._applyLabels();
    }

    private _applyLabels(): void {
        const L = GlobalData.labels;
        const ss = this.scene.sceneStage;

        ss.get('franchiseTitleTXT')?.setText(L['franchise'] ?? '');
        ss.get('storyNameTXT')?.setText(L['storyname'] ?? '');

        const playBtn = ss.get('playBookBTN') as ZButton | null;
        playBtn?.setLabel?.(L['play'] ?? 'Play');
        playBtn?.setCallback(() => { GlobalData.playUiSound('MenuButton.mp3'); GlobalData.playUiSound('start.mp3'); this.onPlay(); });

        const aboutBtn = ss.get('aboutBTN') as ZButton | null;
        aboutBtn?.setLabel?.(L['about'] ?? 'About');
        aboutBtn?.setCallback(() => { GlobalData.playUiSound('MenuButton.mp3'); this.onAbout(); });

        const otherLang = GlobalData.currentLang === 'eng' ? 'HEB' : 'ENG';
        const langBTN = ss.get('langBTN') as ZButton | null;
        langBTN?.setLabel?.(otherLang);
        langBTN?.setCallback(() => {
            const next = GlobalData.currentLang === 'eng' ? 'heb' : 'eng';
            const newLabel = next === 'eng' ? 'HEB' : 'ENG';
            langBTN?.setLabel?.(newLabel);
            this.onLangChange(next);
        });
    }

    destroy(): void {
        const playBtn = this.scene.sceneStage.get('playBookBTN') as ZButton | null;
        playBtn?.removeCallback();
        const aboutBtn = this.scene.sceneStage.get('aboutBTN') as ZButton | null;
        aboutBtn?.removeCallback();

        if (this.scene.sceneStage.parentContainer) {
            this.scene.sceneStage.parentContainer.remove(this.scene.sceneStage);
        }
        this.scene.sceneStage.destroy();
    }
}
