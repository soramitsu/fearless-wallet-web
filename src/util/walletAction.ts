type WalletActionHandlers = {
  setWaiting: (waiting: boolean) => void;
  onSuccess: () => void;
  onFailure: () => void;
};

// Runs a background wallet operation that answers true when it succeeded. A false answer, a rejection and a thrown
// error are all failures; the waiting state ends in every case. Resolves to whether the operation succeeded.
export async function runWalletAction(
  action: () => Promise<boolean>,
  { setWaiting, onSuccess, onFailure }: WalletActionHandlers
): Promise<boolean> {
  let succeeded = false;

  setWaiting(true);

  try {
    succeeded = (await action()) === true;
  } catch {
    succeeded = false;
  } finally {
    setWaiting(false);
  }

  if (succeeded) onSuccess();
  else onFailure();

  return succeeded;
}
