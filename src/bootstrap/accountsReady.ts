// Route availability is checked against the first account response, not the
// store's empty placeholder while the wallet is starting.
let resolveReady!: () => void;
export const initialAccountsReady = new Promise<void>((resolve) => { resolveReady = resolve; });
export const markAccountsReady = (): void => resolveReady();
