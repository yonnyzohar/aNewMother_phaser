import Phaser from 'phaser';
import { ZScene, ZSceneStack, ZTimeline, ZContainer, ZButton } from 'zimporter-phaser';
import { GlobalData } from './GlobalData';
import { evictSceneImagesFromCache, destroyEvictedTextures } from './sceneUtils';
import { SlideObj } from './SlideObj';
import { gsap } from 'gsap';



export class BookController {
    private phaserScene: Phaser.Scene;
    private onBack: () => void;

    // The Block scene — the persistent wooden-frame visual
    private blockScene: ZScene | null = null;
    private blockBGContainer:    ZContainer | null = null;  // center slot
    private blockBGTopContainer: ZContainer | null = null;  // top slot (forward)
    private blockBGBtmContainer: ZContainer | null = null;  // bottom slot (back)
    private filmSides:    ZContainer | null = null;
    private filmSidesTop: ZContainer | null = null;
    private filmSidesBtm: ZContainer | null = null;
    private blockContainer: ZContainer | null = null;
    private textBoxContainer: ZContainer | null = null;

    // The currently-displayed page ZScene (NOT pushed to ZSceneStack — we manage
    // its scale/position manually so ZSceneStack.resize() doesn't fight us)
    private currentPageScene: ZScene | null = null;
    private currentPagePath: string | null = null;
    private tween: gsap.core.Tween | null = null;
    private slideTween: gsap.core.Timeline | null = null;

    private prevBtn!: ZButton;
    private nextBtn!: ZButton;
    private soundBtn!: ZButton;
    private menuBtn!: ZButton;
    private pageIndicator!: ZContainer;

    private blockWidth = 918;
    private blockHeight = 548;
    private twister: ZContainer;

    private audio: HTMLAudioElement | null = null;
    private voiceAudio: HTMLAudioElement | null = null;
    private loading = false;
    private pageMask: Phaser.GameObjects.Graphics | null = null;
    private _pageMaskUpdater: (() => void) | null = null;
    private slotOrigY: Map<ZContainer, number> = new Map();
    private currentOrientation: string = "";

    constructor(phaserScene: Phaser.Scene, onBack: () => void) {
        this.phaserScene = phaserScene;
        this.onBack = onBack;
    }

    // ─── Static preload ───────────────────────────────────────────────────────

    /** Begin loading the Block frame assets in the background. Returns a
     *  promise that resolves with a ready-to-use ZScene so that load() can
     *  skip the network fetch entirely if the user navigates to the book
     *  after the preload has finished. */
    static preloadBlockScene(scene: Phaser.Scene): Promise<ZScene> {
        const zscene = new ZScene('blockFrame', scene);
        return new Promise<ZScene>(resolve => {
            zscene.load(`${GlobalData.assetsBasePath}Block/`, () => resolve(zscene));
        });
    }

    async load(preloadedBlockScene?: ZScene): Promise<void> {
        // 1. Load the Block frame scene — use the pre-loaded scene if available
        if (preloadedBlockScene) {
            this.blockScene = preloadedBlockScene;
        } else {
            this.blockScene = new ZScene('blockFrame', this.phaserScene);
            await new Promise<void>(resolve => {
                this.blockScene!.load(`${GlobalData.assetsBasePath}Block/`, () => resolve());
            });
        }
        // Initialize sceneStage children offscreen so the menu stays visible
        // while the first page loads. We'll add to the real scene afterwards.
        this.blockScene.loadStage(this.phaserScene);
        // Remove from scene temporarily - we'll add it back later
        if (this.blockScene.sceneStage.parentContainer) {
            this.blockScene.sceneStage.parentContainer.remove(this.blockScene.sceneStage);
        }

        // Grab blockBG and textBox containers for positioning
        this.blockBGContainer = this.blockScene.sceneStage.get('blockBG');
        if (this.blockBGContainer) this.blockBGContainer.disableInteractive();
        this.textBoxContainer = this.blockScene.sceneStage.get('textBox');
        this.twister = this.blockScene.sceneStage.get("twister") as ZContainer;

        // Projector slots: top (forward) and bottom (back) — hidden by default.
        this.blockBGTopContainer = this.blockScene.sceneStage.get('blockBGTop');
        this.blockBGBtmContainer = this.blockScene.sceneStage.get('blockBGBTM');
        this.blockBGTopContainer?.setAlpha(0);
        this.blockBGBtmContainer?.setAlpha(0);
        if (this.blockBGTopContainer) this.blockBGTopContainer.disableInteractive();
        if (this.blockBGBtmContainer) this.blockBGBtmContainer.disableInteractive();

        // Film-strip overlays (hit-test disabled; top+btm hidden by default).
        this.filmSides = this.blockScene.sceneStage.get('filmSides');
        if (this.filmSides) this.filmSides.disableInteractive();
        this.filmSidesTop = this.blockScene.sceneStage.get('filmSidesTop');
        this.filmSidesBtm = this.blockScene.sceneStage.get('filmSidesBTM');
        this.filmSidesTop?.setAlpha(0);
        this.filmSidesBtm?.setAlpha(0);
        if (this.filmSidesTop) this.filmSidesTop.disableInteractive();
        if (this.filmSidesBtm) this.filmSidesBtm.disableInteractive();

        // Record natural y positions for all sliding layers so we can reset after transitions.
        [this.blockBGTopContainer, this.filmSidesTop,
         this.blockBGContainer,    this.filmSides,
         this.blockBGBtmContainer, this.filmSidesBtm]
            .filter(Boolean)
            .forEach(c => this.slotOrigY.set(c!, c!.y));

        // blockContainer sits between sceneStage and blockBG — must be passive
        // so events can propagate all the way in to the page children.
        this.blockContainer = this.blockScene.sceneStage.get('blockContainer');
        if (this.blockContainer) this.blockContainer.disableInteractive();

        // Ensure the block scene's own sceneStage passes events through.
        this.blockScene.sceneStage.disableInteractive();
        

        // 2. Build nav-button overlay (always on top)
        this._buildOverlay();

        // 3. Load first page offscreen, then bring the full book onto the scene
        await this._loadPage(GlobalData.counter);

        // Everything is ready — add to real scene and resize stack now
        this.phaserScene.add.existing(this.blockScene.sceneStage);
        ZSceneStack.push(this.blockScene);
        // Force ZSceneStack to reposition the scene now that it's on the display list.
        // (Other screens call push before loadStage so the stack positions during load;
        // here we add manually first, so an explicit resize is needed to centre it.)
        ZSceneStack.resize(window.innerWidth, window.innerHeight);
        // Redraw the page mask now that the scene is in its final world-space position.
        // _applyMask ran while blockScene was still off the display list, so the bounds
        // it captured were wrong. Calling the updater here fixes the initial draw, and
        // subsequent resize events (e.g. entering fullscreen) will also call it.
        this._pageMaskUpdater?.();

        let blockMaster = this.blockScene.sceneStage.get("blockMaster") as ZContainer;

        // Position the Graphics at screen center so GSAP scale grows the circle
        // outward from the center of the screen (GeometryMask uses world-space geometry).
        // Use make.graphics({add:false}) so it never enters the display list and never
        // renders as a visible black circle on screen.
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        let circle = new Phaser.GameObjects.Graphics(this.phaserScene);
        circle.setPosition(cx, cy);
        circle.fillStyle(0x000000, 1);
        circle.fillCircle(0, 0, 50);
        blockMaster.setMask(new Phaser.Display.Masks.GeometryMask(this.phaserScene, circle));
        if (this.tween) this.tween.kill();
        
        // Tween scale from 1→20 to grow the circle from center, revealing the content
        this.tween = gsap.to(circle, {
            duration: 2,
            scaleX: 20,
            scaleY: 20,
            ease: 'power2.out',
            onComplete: () => {
                blockMaster.clearMask();
                circle.destroy();
                this.tween = null;
            },
        });
    }

    // ─── Overlay ─────────────────────────────────────────────────────────────

    private _buildOverlay(): void {
        this.prevBtn = this.blockScene!.sceneStage.get('backBTN') as ZButton;
        this.prevBtn.setCallback(() => this._prev());
        this.nextBtn = this.blockScene!.sceneStage.get('forewardBTN') as ZButton;
        this.nextBtn.setCallback(() => this._next());

        this.soundBtn = this.blockScene?.sceneStage.get("replayBTN") as ZButton;
        this.soundBtn.setLabel(GlobalData.labels['replay']);
        this.soundBtn.setCallback(() => this._playSound());

        this.menuBtn = this.blockScene?.sceneStage.get("menuBTN") as ZButton;
        this.menuBtn.setLabel(GlobalData.labels['mainmenu']);
        this.menuBtn.setCallback(() => this._goBack());
        this.pageIndicator = this.blockScene!.sceneStage.get('pageNum') as ZContainer;
    }

    // ─── Page loading ─────────────────────────────────────────────────────────

    private _setButtonsDisabled(disabled: boolean): void {
        const btns:ZButton[] = [this.prevBtn, this.nextBtn, this.soundBtn, this.menuBtn];
        for (const btn of btns) {
            if (!btn) continue;
            if(disabled){
                btn.disable();
            }
            else{
                btn.enable();
            }
        }
    }

    private async _loadPage(index: number, direction: 0 | 1 | -1 = 0): Promise<void> {
        if (this.loading) return;
        this.loading = true;
        this.twister.setVisible(true);
        this._setButtonsDisabled(true);
        this._stopAudio();

        const slide = GlobalData.pages[index];
        if (!slide) {
            console.warn(`BookController: no slide at index ${index}`);
            this.loading = false;
            this._setButtonsDisabled(false);
            this.twister.setVisible(false);
            return;
        }

        // ── 1. Evict old texture cache entries BEFORE loading the new scene.
        //       This clears alias→texture mappings so the new ZScene gets fresh
        //       textures from the network instead of stale cached ones.
        //       We do NOT destroy the GL textures yet — old sprites still render.
        const oldPagePath = this.currentPagePath;
        const orphanTextures = oldPagePath
            ? await evictSceneImagesFromCache(oldPagePath, this.phaserScene)
            : [];

        // ── 2. Load new scene in the background ──────────────────────────────
        const pagePath = GlobalData.getPagePath(slide.pageNum);
        const scene = new ZScene(`page_${slide.pageNum}`, this.phaserScene);
        await new Promise<void>(resolve => {
            scene.load(pagePath, () => resolve());
        });

        // Capture old refs so we can destroy them after the transition.
        const oldScene = this.currentPageScene;
        const oldMask  = this.pageMask;

        // ── 2. Scale + position the new scene stage ───────────────────────────
        // Force landscape layout: page scenes have no portrait instance data,
        // so ZScene would leave all MCs at (0,0) in portrait and the frozen
        // sceneWidth/sceneHeight would mis-size the hitArea. Overriding
        // setOrientation on the instance before loadStage keeps everything
        // consistently in landscape regardless of the device orientation.
        const sceneAny = scene as any;
        sceneAny.setOrientation = () => { sceneAny.orientation = 'landscape'; };
        // Load into scene, then remove temporarily - we'll add it to blockBGContainer below.
        scene.loadStage(this.phaserScene);
        if (scene.sceneStage.parentContainer) {
            scene.sceneStage.parentContainer.remove(scene.sceneStage);
        }
        delete sceneAny.setOrientation;

        const w = Math.max(scene.sceneWidth, scene.sceneHeight);
        const h = Math.min(scene.sceneWidth, scene.sceneHeight);
        scene.sceneStage.setScale(this.blockWidth / w, this.blockHeight / h);
        scene.sceneStage.x = 0;
        scene.sceneStage.y = 0;

        // ── 3. If no animation (first load), swap immediately ─────────────────
        const canAnimate = direction !== 0
            && this.blockBGTopContainer !== null
            && this.blockBGBtmContainer !== null
            && this.blockContainer !== null;

        if (!canAnimate) {
            if (oldScene) {
                this.blockBGContainer?.remove(oldScene.sceneStage);
                oldScene.sceneStage.destroy();
            }
            if (oldMask) {
                this.blockBGContainer?.remove(oldMask);
                oldMask.destroy();
            }
            // Old sprites are destroyed — now safe to free the orphaned GL textures.
            destroyEvictedTextures(orphanTextures);
            this.pageMask = null;
            this._pageMaskUpdater = null;
            this.currentPageScene = null;
            this.currentPagePath = null;
            this.blockBGContainer?.add(scene.sceneStage);
            this._applyMask(scene, this.blockBGContainer!);
            this._finalizePageLoad(scene, pagePath, slide, index);
            return;
        }

        // ── 4. Projector transition ───────────────────────────────────────────
        // forward (direction=1):  new slide enters from top, slides DOWN to center.
        // backward (direction=-1): new slide enters from bottom, slides UP to center.
        const incomingBG    = direction === 1 ? this.blockBGTopContainer! : this.blockBGBtmContainer!;
        const incomingFilm  = direction === 1 ? this.filmSidesTop         : this.filmSidesBtm;

        // Kill any running tween and reset all slots to their original y positions.
        if (this.slideTween) { this.slideTween.kill(); this.slideTween = null; }

        const allSlots = [
            this.blockBGTopContainer, this.filmSidesTop,
            this.blockBGContainer,    this.filmSides,
            this.blockBGBtmContainer, this.filmSidesBtm,
        ].filter(Boolean) as ZContainer[];

        allSlots.forEach(c => { c.y = this.slotOrigY.get(c) ?? c.y; });

        // Place new scene in the off-screen slot (already at alpha 0).
        incomingBG.add(scene.sceneStage);

        // Target positions: the center (blockBG / filmSides) original y.
        const centerBGY   = this.slotOrigY.get(this.blockBGContainer!) ?? this.blockBGContainer!.y;
        const centerFilmY = this.slotOrigY.get(this.filmSides!)        ?? this.filmSides!.y;
        const origIncomingY = this.slotOrigY.get(incomingBG)           ?? incomingBG.y;
        const deltaY = centerBGY - origIncomingY;   // how far incoming must travel to reach center

        console.log(`[projector] filmSides.y=${centerFilmY}  blockBG.y=${centerBGY}  incomingBG.y=${origIncomingY}  deltaY=${deltaY}`);

        this.slideTween = gsap.timeline({
            onComplete: () => {
                this.slideTween = null;

                // Bring center assets back to their original positions.
                allSlots.forEach(c => { c.y = this.slotOrigY.get(c) ?? c.y; });

                // Move new scene from off-screen slot → center slot.
                incomingBG.remove(scene.sceneStage);
                incomingBG.setAlpha(0);
                incomingFilm?.setAlpha(0);

                // Restore center slot opacity.
                this.blockBGContainer?.setAlpha(1);
                if (this.filmSides) this.filmSides.setAlpha(1);

                // Destroy old scene now that it's fully off-screen.
                if (oldScene) {
                    this.blockBGContainer?.remove(oldScene.sceneStage);
                    oldScene.sceneStage.destroy();
                }
                if (oldMask) {
                    this.blockBGContainer?.remove(oldMask);
                    oldMask.destroy();
                }
                // Old sprites are destroyed — now safe to free the orphaned GL textures.
                destroyEvictedTextures(orphanTextures);
                this.pageMask = null;
                this._pageMaskUpdater = null;
                this.currentPageScene = null;
                this.currentPagePath = null;

                // Add new scene to center and apply mask.
                this.blockBGContainer?.add(scene.sceneStage);
                this._applyMask(scene, this.blockBGContainer!);

                this._finalizePageLoad(scene, pagePath, slide, index);
            },
        });

        // Incoming pair: tween TO center y + fade in.
        this.slideTween.to(incomingBG, { y: centerBGY, alpha: 1, duration: 0.8, ease: 'power2.inOut' }, 0);
        if (incomingFilm)
            this.slideTween.to(incomingFilm, { y: centerFilmY, alpha: 1, duration: 0.8, ease: 'power2.inOut' }, 0);

        // Center pair: tween OUT in the same scroll direction + fade out.
        this.slideTween.to(this.blockBGContainer!, { y: centerBGY + deltaY, alpha: 0, duration: 0.8, ease: 'power2.inOut' }, 0);
        if (this.filmSides)
            this.slideTween.to(this.filmSides!, { y: centerFilmY + deltaY, alpha: 0, duration: 0.8, ease: 'power2.inOut' }, 0);
    }

    /** Apply a Graphics-based mask to a newly-loaded scene in a given container.
     *  Stores a redraw closure so the mask can be repositioned on resize. */
    private _applyMask(scene: ZScene, container: ZContainer): void {
        const innerMSK = container.getByName('innerMSK') as Phaser.GameObjects.Container | null;
        if (!innerMSK) return;
        // Use direct instantiation — never added to the display list, so it
        // never renders visibly, while still working as a stencil mask.
        const gfxMask = new Phaser.GameObjects.Graphics(this.phaserScene);
        const drawMask = () => {
            const b = innerMSK.getBounds();
            gfxMask.clear();
            gfxMask.fillStyle(0xffffff);
            gfxMask.fillRect(b.x, b.y, b.width, b.height);
        };
        drawMask();
        this._pageMaskUpdater = drawMask;
        scene.sceneStage.setMask(new Phaser.Display.Masks.GeometryMask(this.phaserScene, gfxMask));
        this.pageMask = gfxMask;
    }

    /** Runs after page is visually in place — wires up handlers and re-enables UI. */
    private _finalizePageLoad(scene: ZScene, pagePath: string, slide: SlideObj, index: number): void {
        this._playTimelines(scene.sceneStage);
        this.currentPageScene = scene;
        this.currentPagePath = pagePath;
        this._attachVoiceHandlers(scene, slide);
        this.textBoxContainer?.setText(slide.caption);
        this.pageIndicator.setText(`${index + 1} / ${GlobalData.pages.length}`);
        this.prevBtn.visible = index > 0;
        this.loading = false;
        this._setButtonsDisabled(false);
        this.prevBtn?.setCallback(() => { GlobalData.playUiSound('xClose.mp3');this._prev(); });
        this.nextBtn?.setCallback(() => { GlobalData.playUiSound('xClose.mp3');this._next(); });
        this._playSound();
        this.twister.setVisible(false);
    }

    private _playTimelines(container: Phaser.GameObjects.Container): void {
        const children = container.list as any[];
        for (const child of children) {
            if (child instanceof ZTimeline) {
                (child as ZTimeline).play();
            } else if (child instanceof Phaser.GameObjects.Container) {
                this._playTimelines(child);
            }
        }
    }

    private _prev(): void {
        if (this.loading || GlobalData.counter <= 0) return;
        GlobalData.counter--;
        this._loadPage(GlobalData.counter, -1);
    }

    private _next(): void {
        if (this.loading) return;
        if (GlobalData.counter < GlobalData.pages.length - 1) {
            GlobalData.counter++;
            this._loadPage(GlobalData.counter, 1);
        } else {
            this._goBack();
        }
    }

    private _goBack(): void {
        this._stopAudio();
        GlobalData.playUiSound('stop.mp3');
        let blockMaster = this.blockScene!.sceneStage.get("blockMaster") as ZContainer;

        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        let circle = new Phaser.GameObjects.Graphics(this.phaserScene);
        circle.setPosition(cx, cy);
        circle.fillStyle(0x000000, 1);
        circle.fillCircle(0, 0, 50);
        circle.setScale(20, 20); // start fully covering the screen, then shrink to 0
        blockMaster.setMask(new Phaser.Display.Masks.GeometryMask(this.phaserScene, circle));
        if (this.tween) this.tween.kill();
        
        // Tween a Phaser display object's properties over 2 seconds
        this.tween = gsap.to(circle, {
            duration: 2,
            scaleX: 0,
            scaleY: 0,
            ease: 'power2.out',
            onComplete: () => {
                this.tween = null;
                blockMaster.clearMask();
                circle.destroy();
                this.destroy();
                this.onBack();
            },
        });
    }

    // ─── Voice handlers ───────────────────────────────────────────────────────

    private _attachVoiceHandlers(scene: ZScene, slide: SlideObj): void {
        if (Object.keys(slide.voices).length === 0) return;
        console.log(`BookController: attaching voice handlers for page ${slide.pageNum}:`, slide.voices);

        const sceneStage = scene.sceneStage;

        // Walk every ancestor up to root and ensure none block events.
        let node = sceneStage.parentContainer as Phaser.GameObjects.Container | null;
        while (node) {
            node.disableInteractive();
            node = node.parentContainer as Phaser.GameObjects.Container | null;
        }

        // Set up the sceneStage hit area and make it interactive
        const designW = Math.max(scene.sceneWidth, scene.sceneHeight);
        const designH = Math.min(scene.sceneWidth, scene.sceneHeight);
        sceneStage.setInteractive(
            new Phaser.Geom.Rectangle(0, 0, designW, designH),
            Phaser.Geom.Rectangle.Contains
        );

        // ONE listener on sceneStage — resolve the clicked MC via screen-space
        // bounds check, bypassing per-MC containsPoint() issues entirely.
        
        for (const [mcName, voicePath] of Object.entries(slide.voices)) {
            const mc = sceneStage.get(mcName);
            
            if (!mc) {
                console.warn(`BookController: voice MC "${mcName}" not found on page ${slide.pageNum}`);
                continue;
            }
            console.log(`BookController: attached voice handler for "${mcName}" → ${voicePath}`);
            mc.setInteractive();
            if (mc.input) mc.input.cursor = 'pointer';
            mc.removeAllListeners();  // ensure no old handlers remain after page transitions
            
            // Pre-compute and lock the hit area
            const bounds = mc.getBounds();
            mc.setInteractive(
                new Phaser.Geom.Rectangle(
                    bounds.x - mc.x - 10,
                    bounds.y - mc.y - 10,
                    bounds.width + 20,
                    bounds.height + 20
                ),
                Phaser.Geom.Rectangle.Contains
            );
            
            let callback = () => {
                this._stopVoice();
                const url = `${GlobalData.assetsBasePath}${voicePath}`;
                this.voiceAudio = new Audio(url);
                this.voiceAudio.play().catch(e => console.warn(`Voice play error (${mcName}):`, e));

                // Momentary highlight: tint effect (Phaser doesn't have ColorMatrixFilter)
                // Store original tint if it exists
                const originalTint = (mc as any).tint;
                if ((mc as any).setTint) {
                    (mc as any).setTint(0xffee88);
                }
                setTimeout(() => {
                    if (originalTint !== undefined && (mc as any).setTint) {
                        (mc as any).setTint(originalTint);
                    } else if ((mc as any).clearTint) {
                        (mc as any).clearTint();
                    }
                }, 200);
            };
            mc.on('pointerdown', callback);
        }
    }

    /**
     * Called from app.ts AFTER ZSceneStack.resize() has already updated the
     * Block frame scene.  Re-fits the page and repositions buttons/caption.
     */
    resize(_W: number, _H: number): void {
        // Redraw the page mask at its new world-space position after ZSceneStack repositioned the scene.
        this._pageMaskUpdater?.();

        // page scaling is fixed at load time; no resize action needed.
        let orient = window.innerWidth > window.innerHeight ? "landscape" : "portrait";
        if(orient !== this.currentOrientation)
        {
            console.log(`Orientation change: ${this.currentOrientation} → ${orient}`);
            if(this.currentPageScene)
            {

                this._attachVoiceHandlers(this.currentPageScene!, GlobalData.pages[GlobalData.counter]);
            }
            
        }
        this.currentOrientation = orient;
    }

    private _stopVoice(): void {
        if (this.voiceAudio) {
            this.voiceAudio.pause();
            this.voiceAudio.currentTime = 0;
            this.voiceAudio = null;
        }
    }

    // ─── Sound ───────────────────────────────────────────────────────────────

    private _playSound(): void {
        const slide = GlobalData.pages[GlobalData.counter];
        if (!slide?.sound) return;
        this._stopAudio();
        const url = GlobalData.getSoundUrl('assets/sounds/' + slide.sound);
        this.audio = new Audio(url);
        this.audio.play().catch(e => console.warn('Audio play error:', e));
    }

    private _stopAudio(): void {
        if (this.audio) {
            this.audio.pause();
            this.audio.currentTime = 0;
            this.audio = null;
        }
        this._stopVoice();
    }

    // ─── Cleanup ─────────────────────────────────────────────────────────────

    destroy(): void {
        this._stopAudio();

        if (this.pageMask) {
            this.blockBGContainer?.remove(this.pageMask);
            this.pageMask.destroy();
            this.pageMask = null;
        }

        if (this.currentPageScene) {
            if (this.currentPageScene.sceneStage.parentContainer) {
                this.currentPageScene.sceneStage.parentContainer.remove(this.currentPageScene.sceneStage);
            }
            this.currentPageScene.sceneStage.destroy();
            this.currentPageScene = null;
            this.currentPagePath = null;
        }

        if (this.blockScene) {
            ZSceneStack.pop();
            if (this.blockScene.sceneStage.parentContainer) {
                this.blockScene.sceneStage.parentContainer.remove(this.blockScene.sceneStage);
            }
            this.blockScene.sceneStage.destroy();
            this.blockScene = null;
        }
    }
}

