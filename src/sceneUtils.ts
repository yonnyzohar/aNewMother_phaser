import Phaser from 'phaser';
import { ZScene } from 'zimporter-phaser';

/**
 * Safely destroys a ZScene, suppressing any errors that may occur
 * during the destruction process.
 */
export async function safeDestroyScene(scene: ZScene): Promise<void> {
    try {
        await scene.destroy();
    } catch (e) {
        // Non-critical: may happen for image-based scenes that have no spritesheet.
        // Phaser still frees the textures in the destroy loop.
    }
}

/**
 * Reads the placements.json for a scene folder and returns every image alias
 * that ZScene would have registered (stripping _9S / _IMG suffixes).
 * Returns an empty array on any error or for atlas-based scenes.
 */
async function _readAliases(assetBasePath: string): Promise<string[]> {
    const res = await fetch(assetBasePath + 'placements.json');
    if (!res.ok) return [];
    const data = await res.json() as {
        atlas?: boolean;
        templates?: Record<string, {
            children?: Array<{ type: string; name: string; filePath?: string }>
        }>
    };
    if (data.atlas !== false) return [];

    const seen = new Set<string>();
    const result: string[] = [];
    for (const tmpl of Object.values(data.templates ?? {})) {
        for (const child of (tmpl.children ?? [])) {
            if (child.type === 'img' || child.type === '9slice') {
                let alias = child.name;
                if (alias.endsWith('_9S'))  alias = alias.slice(0, -3);
                if (alias.endsWith('_IMG')) alias = alias.slice(0, -4);
                if (!seen.has(alias)) { seen.add(alias); result.push(alias); }
            }
        }
    }
    return result;
}

/**
 * Phase 1 — call this BEFORE loading the next page.
 *
 * Removes alias entries from Phaser's texture cache WITHOUT destroying the
 * underlying WebGL textures.  This forces the next ZScene load for those
 * aliases to download fresh textures rather than reusing old cached ones,
 * while still allowing the old page's sprites to keep rendering safely.
 *
 * Returns the evicted Texture objects.  You MUST call .destroy() on each one
 * after all sprites that referenced them have been destroyed (phase 2).
 */
export async function evictSceneImagesFromCache(
    assetBasePath: string,
    scene: Phaser.Scene,
): Promise<Phaser.Textures.Texture[]> {
    const evicted: Phaser.Textures.Texture[] = [];
    try {
        const aliases = await _readAliases(assetBasePath);
        const texList = (scene.textures as any).list as Record<string, Phaser.Textures.Texture>;
        for (const alias of aliases) {
            if (texList[alias]) {
                evicted.push(texList[alias]);
                delete texList[alias]; // remove cache entry but keep GL texture alive
            }
        }
    } catch (_) { /* non-fatal */ }
    return evicted;
}

/**
 * Phase 2 helper — call this AFTER old sprites are destroyed.
 * Destroys the Texture objects returned by evictSceneImagesFromCache,
 * freeing WebGL memory.
 */
export function destroyEvictedTextures(textures: Phaser.Textures.Texture[]): void {
    for (const tex of textures) {
        try { tex.destroy(); } catch (_) { /* already destroyed */ }
    }
}

/** @deprecated Use evictSceneImagesFromCache + destroyEvictedTextures instead. */
export async function unloadSceneImages(assetBasePath: string, scene?: Phaser.Scene): Promise<void> {
    if (!scene) return;
    try {
        const aliases = await _readAliases(assetBasePath);
        for (const alias of aliases) {
            if (scene.textures.exists(alias)) scene.textures.remove(alias);
        }
    } catch (_) { /* non-fatal */ }
}
