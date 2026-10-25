// Account and password stores share this guard without a dependency cycle.
export const webStorageMode = { recoveryOnly: false };

export function assertWebStorageWritable(): void {
  if (webStorageMode.recoveryOnly)
    throw new Error('Wallet storage needs repair. Reload to retry. Existing accounts can still be exported.');
}
