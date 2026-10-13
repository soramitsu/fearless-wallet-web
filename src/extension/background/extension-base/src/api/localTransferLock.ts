// A worker can receive multiple Send requests before either has saved its
// pending transaction. Keep that admission check and the entire send operation
// exclusive for the on-chain sender. Durable pending records take over after
// the operation finishes or the worker restarts.
const activeSenders = new Set<string>();

export async function withLocalTransferLock<T>(
  sender: string,
  pendingError: string,
  send: () => Promise<T>
): Promise<T> {
  if (activeSenders.has(sender)) throw new Error(pendingError);
  activeSenders.add(sender);

  try {
    return await send();
  } finally {
    activeSenders.delete(sender);
  }
}
