/**
 * E-Ink mode.
 *
 * Built for a Bigme B7 Pro: 7", 1264x1680 portrait, 300 ppi in mono against
 * only 150 in colour — so black and white is the sharp mode on that panel,
 * not a compromise.
 *
 * The mode is aimed at REVIEWING a plan rather than drawing one. It drops
 * colour, kills every transition and animation (they smear badly on e-ink),
 * flattens shadows and gradients, and grows hit targets for a finger or the
 * EMR stylus. It also drops out of the 3D view, which is not worth having on
 * a 7" e-ink panel.
 *
 * Everything it does is CSS under `html.eink`, so turning it off restores the
 * normal app exactly. Nothing about the project data changes.
 */

import { writable } from 'svelte/store';
import { viewMode } from './project';

const STORAGE_KEY = 'openplan3d.einkMode';

function readStored(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function applyToDocument(on: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('eink', on);
}

export const einkMode = writable<boolean>(false);

/** Call once on mount so a reload comes back in the mode it was left in. */
export function initEinkMode(): void {
  const stored = readStored();
  einkMode.set(stored);
  applyToDocument(stored);
}

export function setEinkMode(on: boolean): void {
  einkMode.set(on);
  applyToDocument(on);
  try {
    localStorage.setItem(STORAGE_KEY, String(on));
  } catch {
    /* private browsing — it just will not persist */
  }
  // 3D on a 7" e-ink panel is not worth having, so switch to the plan view.
  if (on) viewMode.set('2d');
}

export function toggleEinkMode(): void {
  let current = false;
  const stop = einkMode.subscribe((v) => { current = v; });
  stop();
  setEinkMode(!current);
}
