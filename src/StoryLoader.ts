import { GlobalData } from './GlobalData';
import { SlideObj } from './SlideObj';

export class StoryLoader {

    /** Load story data and labels for the given language ("eng" or "heb"). */
    static async load(lang: string): Promise<void> {
        GlobalData.currentLang = lang;
        const base = GlobalData.getLangPath();

        await Promise.all([
            StoryLoader.loadStory(`${base}story.json`),
            StoryLoader.loadLabels(`${base}lables.json`),
        ]);
    }

    private static async loadStory(url: string): Promise<void> {
        const data = await StoryLoader.fetchJSON<{ items: Array<{ file: string; sound: string; caption: string; voices: Record<string, string> }> }>(url);
        if (!data) return;

        GlobalData.pages = [];

        data.items.forEach((item, index) => {
            // Item at index 0 is a jpg title card with no pages/ folder — skip it.
            if (index === 0) return;

            const slide = new SlideObj();
            slide.pageNum = index; // pages/<index>/ folder exists for 1-27
            slide.sound = item.sound.split('/').pop() ?? '';
            slide.caption = item.caption;
            slide.voices = item.voices ?? {};
            GlobalData.pages.push(slide);
        });

        console.log(`StoryLoader: loaded ${GlobalData.pages.length} pages`);
    }

    private static async loadLabels(url: string): Promise<void> {
        const data = await StoryLoader.fetchJSON<Record<string, string>>(url);
        if (!data) return;

        GlobalData.labels = data;
    }

    private static async fetchJSON<T>(url: string): Promise<T | null> {
        try {
            const res = await fetch(url);
            return await res.json() as T;
        } catch (e) {
            console.warn(`StoryLoader: failed to fetch ${url}`, e);
            return null;
        }
    }
}
