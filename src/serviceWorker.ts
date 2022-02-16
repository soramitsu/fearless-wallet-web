chrome.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
  const isInstall = reason === chrome.runtime.OnInstalledReason.INSTALL;

  console.log(`Extension has been ${isInstall ? 'installed' : 'updated'}. Previous version: ${previousVersion}`);
});
