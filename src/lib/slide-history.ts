// No value imports: scripts/check-canvas.ts loads this in plain node.

/**
 * Per-slide undo/redo.
 *
 * The server keeps five previous versions per slide and can only walk
 * backwards — once a version is popped it is gone, and there is no redo. That
 * is a fine safety net between sessions but useless for an editor where every
 * drag is a step, so the live history lives here, in memory, and is discarded
 * on reload exactly like Canva's.
 *
 * A snapshot is the slide's body HTML. Storing whole documents rather than
 * diffs is the lazy choice and the right one: the DOM is already the source of
 * truth, restoring is a single assignment, and it cannot desync from a partial
 * patch. The cap below keeps the memory cost bounded.
 */

export interface History {
  /** Snapshots oldest-first. */
  stack: string[];
  /** Index of the snapshot currently on screen. */
  cursor: number;
}

/** Beyond this, the oldest snapshot is dropped. */
export const MAX_HISTORY = 60;

export function createHistory(initial: string): History {
  return { stack: [initial], cursor: 0 };
}

/**
 * Record a completed gesture. Anything the user had redone away is discarded,
 * which is what makes the timeline linear and predictable.
 */
export function pushHistory(history: History, snapshot: string): History {
  if (history.stack[history.cursor] === snapshot) return history;

  const stack = [...history.stack.slice(0, history.cursor + 1), snapshot];
  if (stack.length > MAX_HISTORY) stack.shift();
  return { stack, cursor: stack.length - 1 };
}

export function canUndo(history: History): boolean {
  return history.cursor > 0;
}

export function canRedo(history: History): boolean {
  return history.cursor < history.stack.length - 1;
}

export function undo(
  history: History
): { history: History; snapshot: string } | null {
  if (!canUndo(history)) return null;
  const cursor = history.cursor - 1;
  return { history: { ...history, cursor }, snapshot: history.stack[cursor] };
}

export function redo(
  history: History
): { history: History; snapshot: string } | null {
  if (!canRedo(history)) return null;
  const cursor = history.cursor + 1;
  return { history: { ...history, cursor }, snapshot: history.stack[cursor] };
}
