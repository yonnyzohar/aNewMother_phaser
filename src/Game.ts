import Phaser from 'phaser';
import { ZSceneStack, ZUpdatables } from 'zimporter-phaser';
import { SplashScreen } from './SplashScreen';
import { MainMenu } from './MainMenu';
import { AboutScreen } from './AboutScreen';
import { BookController } from './BookController';
import { GlobalData } from './GlobalData';
import { Preloader } from './Preloader';

type Screen = 'splash' | 'menu' | 'about' | 'book';

export class Game extends Phaser.Scene {
    private currentScreen: Screen = 'splash';
    private _frameCount: number = 0;
    private _lastTime: number = 0;
    private _fpsText!: Phaser.GameObjects.Text;

    /** Keep a reference to the active screen object for resize forwarding. */
    private activeBook: BookController | null = null;
    private activeMenu: MainMenu | null = null;

    /** Pending background preload of the Block frame scene. */
    private _blockPreload: Promise<any> | null = null;

    constructor() {
        super({ key: 'GameScene' });
    }

    create() {
        ZUpdatables.init(24);

        this._frameCount = 0;
        this._lastTime = performance.now();
        this._fpsText = this.add.text(10, 10, 'FPS: --', {
            fontSize: '24px',
            color: '#ffffff'
        }).setDepth(9999);

        this._showSplash();
    }

    // ─── Screen transitions ────────────────────────────────────────────────────

    private async _showSplash(): Promise<void> {
        this.currentScreen = 'splash';

        // Splash onComplete fires after 2 s; we use it to begin loading the menu
        // while the splash is still visible.
        const splash = new SplashScreen(this, () => this._splashToMenu(splash));
        await splash.load();
    }

    /** Called by SplashScreen after its 2-second hold. Loads menu, then removes splash. */
    private async _splashToMenu(splash: SplashScreen): Promise<void> {
        const menu = this._buildMenu();
        await menu.load(); // menu is added to scene (on top of splash)

        splash.destroy(); // splash is now hidden behind menu — safe to destroy
        this.currentScreen = 'menu';
        this.activeMenu = menu;
        this._blockPreload = BookController.preloadBlockScene(this);
    }

    /** Constructs a MainMenu wired to this Game's callbacks. */
    private _buildMenu(): MainMenu {
        GlobalData.counter = 0;
        let menu!: MainMenu;
        menu = new MainMenu(
            this,
            () => this._showBook(),
            () => this._showAbout(),
            (lang: string) => {
                GlobalData.currentLang = lang;
                menu.reload();
            },
        );
        return menu;
    }

    /** Loads a fresh menu. Called when returning from About or Book. */
    private async _showMenu(): Promise<void> {
        this.currentScreen = 'menu';

        const menu = this._buildMenu();
        await menu.load();

        this.activeMenu = menu;
        this._blockPreload = BookController.preloadBlockScene(this);
    }

    private async _showAbout(): Promise<void> {
        this.currentScreen = 'about';
        const menuToDestroy = this.activeMenu;
        this.activeMenu = null;

        // Show preloader on top of the menu — disables all menu buttons.
        const preloader = new Preloader(this);
        preloader.show();

        // Pop the menu from the resize stack before About pushes itself on top.
        ZSceneStack.pop();

        const about = new AboutScreen(this, () => this._showMenu());
        await about.load(); // about is added to scene on top of menu + preloader

        menuToDestroy?.destroy(); // menu is hidden behind about — safe to destroy
        preloader.hide();
    }

    private async _showBook(): Promise<void> {
        this.currentScreen = 'book';
        const menuToDestroy = this.activeMenu;
        this.activeMenu = null;

        // Await the background preload (instant if it already finished).
        const preloadedScene = this._blockPreload ? await this._blockPreload : undefined;
        this._blockPreload = null;

        const book = new BookController(this, () => {
            this.activeBook = null;
            this._showMenu();
        });
        this.activeBook = book;
        // book.load() keeps everything offscreen until the first page is ready,
        // so the menu stays fully visible throughout.
        await book.load(preloadedScene);

        // Book is fully ready — now pop the menu and swap.
        ZSceneStack.pop();
        menuToDestroy?.destroy();
    }

    // ─── Called by Phaser update loop ─────────────────────────────────────────

    update(_time: number, delta: number) {
        // FPS counter
        this._frameCount++;
        const now = performance.now();
        const elapsed = now - this._lastTime;
        if (elapsed >= 1000) {
            const fps = (this._frameCount / elapsed) * 1000;
            this._fpsText.setText(`FPS: ${fps.toFixed(1)}`);
            this._fpsText.setDepth(9999);
            this._frameCount = 0;
            this._lastTime = now;
        }

        ZUpdatables.update();
    }

    /** Called when the window resizes. */
    resize(width: number, height: number): void {
        ZSceneStack.resize(width, height);
        this.activeBook?.resize(width, height);
    }
}