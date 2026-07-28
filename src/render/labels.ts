import * as THREE from 'three';

const LABEL_FONT_PX = 48;
const LABEL_PADDING_PX = 12;

/**
 * Canvas-textured sprite used for in-scene text (scale-bar ticks, bounding
 * box dimensions). The canvas is sized to the measured text so labels never
 * clip, and the resulting aspect ratio is stashed in `userData.aspect` for
 * `setLabelHeight` to keep them undistorted.
 */
export function makeLabelSprite(text: string, color = '#cfd8dc'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `${LABEL_FONT_PX}px system-ui, sans-serif`;

  let width = text.length * LABEL_FONT_PX * 0.6;
  if (ctx) {
    ctx.font = font;
    width = ctx.measureText(text).width;
  }
  canvas.width = Math.max(2, Math.ceil(width + LABEL_PADDING_PX * 2));
  canvas.height = Math.ceil(LABEL_FONT_PX * 1.4);

  if (ctx) {
    // Resizing the canvas resets the 2d context, so restate the font here.
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }),
  );
  sprite.userData.aspect = canvas.width / canvas.height;
  sprite.renderOrder = 10;
  return sprite;
}

/** Scales a label sprite to a given world-space height, preserving its aspect ratio. */
export function setLabelHeight(sprite: THREE.Sprite, height: number): void {
  const aspect = typeof sprite.userData.aspect === 'number' ? sprite.userData.aspect : 2;
  sprite.scale.set(height * aspect, height, 1);
}

/**
 * Disposes geometry/materials under a helper object. Sprite geometry is a
 * shared static instance in Three.js, so only sprite materials/textures are
 * released.
 */
export function disposeObjectTree(object: THREE.Object3D | null): void {
  if (!object) return;
  object.traverse((child) => {
    if (child instanceof THREE.Sprite) {
      child.material.map?.dispose();
      child.material.dispose();
      return;
    }
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
      child.geometry.dispose();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
    }
  });
}
