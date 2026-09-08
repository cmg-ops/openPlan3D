/**
 * 1-bit ink for E-Ink mode.
 *
 * The first version of E-Ink mode just greyscaled the page, which left the
 * grid, the text and the images sitting in mid-grey. On a reflective panel
 * with no backlight that reads as dirt. This snaps every canvas colour to
 * pure black or pure white instead.
 *
 * It works by wrapping the 2D context in a Proxy, so the ~261 individual
 * draw calls scattered through canvasRenderer.ts do not have to change. They
 * keep setting the colours they always set; those assignments get snapped on
 * the way through.
 *
 * The rules:
 *   strokes  — always black, unless the colour is near-white (a white line
 *              drawn deliberately on top of something dark)
 *   fills    — white if light, black if dark, pivoting well up the range so
 *              pale tints become white paper rather than black blocks
 *   grid     — light greys are strokes, so they land on black and stay visible
 *              instead of vanishing into the page
 *
 * Translucency, shadows and gradients are all flattened: an e-ink panel
 * cannot show them and they only muddy the result.
 */

import { einkMode } from '$lib/stores/einkMode';

/** Read synchronously on every property set, so keep it a plain boolean
 *  rather than calling get() thousands of times per frame. */
let active = false;
einkMode.subscribe((v) => { active = v; });

const BLACK = '#000000';
const WHITE = '#ffffff';

/** Anything at or above this luminance (0-255) counts as paper. */
const FILL_PIVOT = 186;
/** Strokes only stay white if they are almost pure white. */
const STROKE_WHITE_PIVOT = 240;

/** [r, g, b, alpha]. Alpha matters: room fills arrive as rgba(...,0.12), and
 *  judging those on their raw colour would black out an entire room that
 *  actually renders as a pale tint. */
type Rgba = [number, number, number, number];

const NAMED: Record<string, Rgba> = {
  white: [255, 255, 255, 1],
  black: [0, 0, 0, 1],
  red: [255, 0, 0, 1],
  transparent: [255, 255, 255, 0]
};

function parseColour(value: string): Rgba | null {
  const c = value.trim().toLowerCase();
  if (NAMED[c]) return NAMED[c];

  if (c.startsWith('#')) {
    let hex = c.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.slice(0, 3).split('').map((ch) => ch + ch).join('');
    }
    let alpha = 1;
    if (hex.length === 8) {
      alpha = parseInt(hex.slice(6, 8), 16) / 255;
      hex = hex.slice(0, 6);
    }
    if (hex.length !== 6) return null;
    const n = parseInt(hex, 16);
    if (Number.isNaN(n)) return null;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
  }

  const m = c.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(',').map((p) => parseFloat(p));
    if (parts.length >= 3 && parts.slice(0, 3).every((p) => !Number.isNaN(p))) {
      const alpha = parts.length > 3 && !Number.isNaN(parts[3]) ? parts[3] : 1;
      return [parts[0], parts[1], parts[2], alpha];
    }
  }
  return null;
}

/** Luminance as it will actually appear, composited over white paper. */
function luminance(rgba: Rgba): number {
  const raw = 0.2126 * rgba[0] + 0.7152 * rgba[1] + 0.0722 * rgba[2];
  const alpha = Math.max(0, Math.min(1, rgba[3]));
  return alpha * raw + (1 - alpha) * 255;
}

function snapFill(value: unknown): string {
  // Gradients and patterns are objects, not strings. There is no useful 1-bit
  // version of a gradient, so treat them as paper and let the stroke carry
  // the shape.
  if (typeof value !== 'string') return WHITE;
  const rgba = parseColour(value);
  if (!rgba) return WHITE;
  // A translucent fill is an area tint laid over paper — a room colour, a
  // highlight. Those must stay white or a strongly coloured room turns into
  // a solid black block. Opaque fills are text, handles and markers, and get
  // judged on luminance.
  if (rgba[3] < 0.6) return WHITE;
  return luminance(rgba) >= FILL_PIVOT ? WHITE : BLACK;
}

function snapStroke(value: unknown): string {
  if (typeof value !== 'string') return BLACK;
  const rgba = parseColour(value);
  if (!rgba) return BLACK;
  return luminance(rgba) >= STROKE_WHITE_PIVOT ? WHITE : BLACK;
}

/** Threshold photographs and textures as they are drawn, so they come out as
 *  line art rather than grey mush. */
const IMAGE_FILTER = 'grayscale(1) contrast(1000%)';

/**
 * Wrap a 2D context. When E-Ink mode is off this passes everything straight
 * through unchanged, so the normal app is unaffected.
 */
export function inkContext(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D {
  return new Proxy(ctx, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== 'function') return value;

      if (active && prop === 'drawImage') {
        return function (this: unknown, ...args: unknown[]) {
          const previous = target.filter;
          target.filter = IMAGE_FILTER;
          try {
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          } finally {
            target.filter = previous;
          }
        };
      }
      return value.bind(target);
    },

    set(target, prop, value) {
      if (!active) {
        (target as unknown as Record<string | symbol, unknown>)[prop] = value;
        return true;
      }
      switch (prop) {
        case 'fillStyle':
          target.fillStyle = snapFill(value);
          return true;
        case 'strokeStyle':
          target.strokeStyle = snapStroke(value);
          return true;
        case 'globalAlpha':
          // No half-tones. Anything drawn at all is drawn solid.
          target.globalAlpha = 1;
          return true;
        case 'shadowBlur':
          target.shadowBlur = 0;
          return true;
        case 'shadowColor':
          target.shadowColor = 'transparent';
          return true;
        default:
          (target as unknown as Record<string | symbol, unknown>)[prop] = value;
          return true;
      }
    }
  });
}
