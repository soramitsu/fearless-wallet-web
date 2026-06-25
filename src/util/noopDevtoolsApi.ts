type DevtoolsSetup = (...args: unknown[]) => void;

export const setupDevToolsPlugin: DevtoolsSetup = () => {};
export const setupDevtoolsPlugin = setupDevToolsPlugin;

export const addCustomCommand = () => {};
export const removeCustomCommand = () => {};
export const addCustomTab = () => {};
export const onDevToolsConnected = () => {};
export const onDevToolsClientConnected = () => {};
