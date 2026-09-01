/**
 * In-memory change bus for publishing fine-grained workspace mutation events.
 */

export type WorkspaceChangeEvent = Readonly<{
  databaseIds: readonly string[];
  nodeIds: readonly string[];
  recordIds: readonly string[];
  relationIds: readonly string[];
  viewIds: readonly string[];
}>;

export type WorkspaceChangeListener = (event: WorkspaceChangeEvent) => void;

export class WorkspaceChangeBus {
  readonly #listeners = new Set<WorkspaceChangeListener>();

  subscribe(listener: WorkspaceChangeListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  publish(event: WorkspaceChangeEvent): void {
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch {
        // Suppress listener errors
      }
    }
  }
}
