// Share an in-flight initialization, keep a successful result, and let the next
// request retry after a failure (for example after the wallet window reloads).
export function retryableInitialization(initialize: () => Promise<void>): () => Promise<void> {
  let pending: Promise<void> | undefined;
  return () => {
    if (!pending) {
      pending = initialize().catch((error) => {
        pending = undefined;
        throw error;
      });
    }
    return pending;
  };
}
