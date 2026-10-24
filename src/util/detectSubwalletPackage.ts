/**
 * The Subwallet fork has its own version sequence and package scope. Polkadot's
 * detector only accepts @polkadot packages; keep fork duplicate diagnostics in
 * a separate registry without changing any keyring implementation.
 */
type Descriptor = { name: string; version: string; path: string; type: string };
const registryKey = Symbol.for('fearless.subwallet.packageVersions');
const registryHost = globalThis as typeof globalThis & { [registryKey]?: Map<string, Descriptor[]> };

export function detectSubwalletPackage(info: Descriptor): void {
  if (!['@subwallet/keyring', '@subwallet/ui-keyring'].includes(info.name)) {
    throw new Error(`Unexpected fork package descriptor: ${info.name}`);
  }
  const registry = (registryHost[registryKey] ??= new Map());
  const entries = registry.get(info.name) ?? [];
  if (entries.some((entry) => entry.version !== info.version)) {
    console.warn(`${info.name} has multiple versions; install matching versions.`, [...entries, info]);
  }
  entries.push(info);
  registry.set(info.name, entries);
}
