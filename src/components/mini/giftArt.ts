import * as THREE from 'three';
import { GiftId } from './catalog';

/**
 * Optional gift artwork: public/mini/gifts/<id>.png (transparent background).
 * Anything missing falls back to the built-in emoji/3D stand-in, so art can be
 * dropped in one gift at a time.
 */

export function giftUrl(id: GiftId): string {
  return `${import.meta.env.BASE_URL}mini/gifts/${id}.png`;
}

/** How tall each prop is drawn when held, in world units (puppet is 1.6 tall). */
export const PROP_HEIGHT: Record<GiftId, number> = {
  chocolate: 0.32,
  ring: 0.22,
  flowers: 0.55,
  teddy: 0.5,
  icecream: 0.55,
  lego: 0.28,
  bottle: 0.42,
  pizza: 0.42,
  controller: 0.28,
  blanket: 0.9,
};

export interface GiftTexture {
  texture: THREE.Texture;
  aspect: number;
}

const cache = new Map<GiftId, Promise<GiftTexture | null>>();

export function loadGiftTexture(id: GiftId): Promise<GiftTexture | null> {
  let hit = cache.get(id);
  if (!hit) {
    hit = new Promise((resolve) => {
      new THREE.TextureLoader().load(
        giftUrl(id),
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = 4;
          const img = texture.image as { width: number; height: number };
          resolve({ texture, aspect: img.width / img.height });
        },
        undefined,
        () => resolve(null),
      );
    });
    cache.set(id, hit);
  }
  return hit;
}
