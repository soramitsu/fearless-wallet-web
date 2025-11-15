export {};

declare global {
  type ChromeApi = typeof chrome;

  const browser: ChromeApi | undefined;

  interface Window {
    browser?: ChromeApi;
  }
}
