import { subscribeMessage } from '@/extension/messaging';

/** Reloading after lock discards cached recovery phrases, passwords, and signing
 * components in every open wallet page, including Vue's keep-alive cache. */
export function watchWalletLock(onLock: () => void): () => void {
  const listener = subscribeMessage('pri(keyring.subscribeLock)', null, () => onLock());
  // The initial locked state is not a transition and must not cause a reload loop.
  void listener.response.catch(() => {});
  return listener.unsubscribe;
}
