/**
 * Model-id constants the UI needs before `GET /api/models` has resolved.
 *
 * Two different ideas were both spelled `'silma'` across the codebase, which
 * is why changing the registered models broke things in places that had
 * nothing to do with the change:
 *
 *   - the model to *use* when nothing has been chosen yet, and
 *   - the model a *stored row* came from, back when `modelId` did not exist.
 *
 * They are only the same value by accident, and they move independently:
 * unregistering SILMA changes the first and must not touch the second, or old
 * history would relabel itself.
 *
 * Prefer `useModels().data.default` — the engine is the real source of truth
 * (`model_registry.DEFAULT_MODEL_ID`). These are the synchronous fallbacks for
 * form defaults and first paint.
 */

/** What to select when the user has not chosen, and the list has not loaded. */
export const DEFAULT_MODEL_ID = 'voicetut';

/** What a `Generation`/`Preset` row with no `modelId` was rendered by. Historical — never change it. */
export const LEGACY_MODEL_ID = 'silma';
