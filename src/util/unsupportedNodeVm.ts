const unavailable = (): never => {
  throw new Error('Node.js vm is unavailable in a browser extension');
};

// asn1.js probes vm.runInThisContext inside a try/catch and has an equivalent
// browser-safe constructor fallback. Export an explicit throwing shim so the
// browser build cannot silently receive Vite's generic external-module proxy.
export const runInThisContext = unavailable;

export default { runInThisContext };
