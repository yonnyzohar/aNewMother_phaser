import { SlideObj } from './SlideObj';

export class GlobalData {
    static currentLang: string = "eng";
    static pages: SlideObj[] = [];
    static labels: Record<string, string> = {};
    static counter: number = 0; // 0-based index into pages[] (pages 1-27)

    static get assetsBasePath(): string {
        return "./assets/";
    }

    static getLangPath(): string {
        return `${GlobalData.assetsBasePath}${GlobalData.currentLang}/`;
    }

    static getPagePath(pageNum: number): string {
        return `${GlobalData.assetsBasePath}pages/${pageNum}/`;
    }

    /** Convert a sound path from story XML (e.g. "assets/sounds/1.mp3") to a
     *  browser-relative URL pointing at the correct language sounds folder. */
    static getSoundUrl(soundPath: string): string {
        const filename = soundPath.split('/').pop() ?? '';
        return `${GlobalData.getLangPath()}sounds/${filename}`;
    }

    /** Play a short UI sound from dist/assets/sounds/<name>. Fire-and-forget. */
    static playUiSound(name: string): void {
        const audio = new Audio(`${GlobalData.assetsBasePath}sounds/${name}`);
        audio.play().catch(() => {});
    }
}
