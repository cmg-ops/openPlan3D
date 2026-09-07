/**
 * Hub sync — save and load plans through the DailyHobbyist dashboard worker.
 *
 * Why this exists: it lets Claude edit a plan between a save and a load, using
 * the dashboard document tools it already has. No Anthropic API billing is
 * involved; the editing happens in an ordinary chat.
 *
 * The endpoint is deliberately narrow. Its key can only reach documents whose
 * id starts with `plan-`, so a key sitting in this browser cannot touch the
 * rest of the dashboard even though this app is publicly reachable.
 */

const HUB = 'https://dashboard.gaylordsgaragehonda.workers.dev/api/plan';
const KEY_STORAGE = 'openplan3d.hubKey';
const ID_STORAGE = 'openplan3d.hubPlanId';
const DEFAULT_PLAN_ID = 'plan-house';

/** Matches the pattern the worker enforces. Checked here too so a bad id
 *  gives an immediate, readable message instead of a 400 from the server. */
const ID_PATTERN = /^plan-[a-z0-9-]{1,40}$/;

export function getHubKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setHubKey(key: string): void {
  try {
    localStorage.setItem(KEY_STORAGE, key.trim());
  } catch {
    /* private browsing — the key just will not persist */
  }
}

export function getPlanId(): string {
  try {
    return localStorage.getItem(ID_STORAGE) || DEFAULT_PLAN_ID;
  } catch {
    return DEFAULT_PLAN_ID;
  }
}

export function setPlanId(id: string): void {
  try {
    localStorage.setItem(ID_STORAGE, id.trim());
  } catch {
    /* as above */
  }
}

export function isValidPlanId(id: string): boolean {
  return ID_PATTERN.test(id.trim());
}

function requireSetup(): { key: string; id: string } {
  const key = getHubKey();
  if (!key) throw new Error('No hub key set. Open Settings and paste your plan key first.');
  const id = getPlanId();
  if (!isValidPlanId(id)) {
    throw new Error(`Plan id "${id}" is not valid. It must look like plan-house — lowercase letters, digits and dashes.`);
  }
  return { key, id };
}

function endpoint(id: string, key: string): string {
  return `${HUB}?id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`;
}

/** Turn a failed response into something worth reading. */
async function describeFailure(response: Response): Promise<string> {
  let detail = '';
  try {
    const body = await response.json();
    detail = body?.error ? String(body.error) : '';
  } catch {
    /* not JSON — fall through to the status text */
  }
  if (response.status === 401) return 'The hub rejected the key. Check it in Settings.';
  if (response.status === 404) return 'Nothing saved to the hub under this plan id yet.';
  if (response.status === 413) return detail || 'This plan is too large for the hub.';
  return detail || `The hub returned ${response.status}.`;
}

/** Send the current project to the hub. Returns the timestamp it was stored at. */
export async function saveToHub(project: unknown): Promise<string> {
  const { key, id } = requireSetup();
  const response = await fetch(endpoint(id, key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project)
  });
  if (!response.ok) throw new Error(await describeFailure(response));
  const body = await response.json();
  return body?.updated ?? '';
}

/**
 * Fetch the stored plan. Returns the parsed project, which the caller must
 * still put through the normal project-opening path so it gets validated the
 * same way an imported file would.
 */
export async function loadFromHub(): Promise<unknown> {
  const { key, id } = requireSetup();
  const response = await fetch(endpoint(id, key), { method: 'GET' });
  if (!response.ok) throw new Error(await describeFailure(response));
  const body = await response.json();
  if (typeof body?.plan !== 'string') throw new Error('The hub returned something that was not a plan.');
  try {
    return JSON.parse(body.plan);
  } catch {
    throw new Error('The stored plan is not readable JSON. Nothing was changed.');
  }
}
