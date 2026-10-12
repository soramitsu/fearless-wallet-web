import type { AuthUrlInfo, AuthUrls } from '@extension-base/background/types/types';

type Changes = Record<string, AuthUrlInfo | undefined>;
type Write = {
  changes: Changes;
  dependencies: Write[];
  status: 'pending' | 'committed' | 'failed';
  result?: Promise<AuthUrls>;
};

// A pending write may remove authority, but only a committed write may add it.
// Keep failed revocations in this process even when physical storage is unavailable.
const restrict = (current: AuthUrlInfo | undefined, next: AuthUrlInfo | undefined): AuthUrlInfo | undefined => {
  if (!current || !next) return undefined;
  const result = structuredClone(current);
  result.isAllowed = current.isAllowed === true && next.isAllowed === true && current.id === next.id;
  result.authorizedAccounts = current.authorizedAccounts.filter((account) => next.authorizedAccounts.includes(account));
  if (
    current.evmAuthorizedAccount?.toLowerCase() !== next.evmAuthorizedAccount?.toLowerCase() ||
    current.currentEvmNetworkKey?.toLowerCase() !== next.currentEvmNetworkKey?.toLowerCase()
  )
    result.evmAuthorizedAccount = '';
  if (current.solanaAuthorizedAccount !== next.solanaAuthorizedAccount) result.solanaAuthorizedAccount = '';
  if (current.irohaAuthorizedAccount !== next.irohaAuthorizedAccount) result.irohaAuthorizedAccount = '';
  for (const account of Object.keys(result.allowedAccountsMap ?? {}))
    result.allowedAccountsMap[account] =
      result.allowedAccountsMap[account] === true && next.allowedAccountsMap?.[account] === true;
  return result;
};

function apply(entries: AuthUrls, changes: Changes, veto = false): void {
  for (const [origin, value] of Object.entries(changes)) {
    const next = veto ? restrict(entries[origin], value) : value;
    if (next) entries[origin] = structuredClone(next);
    else delete entries[origin];
  }
}

/** Serializes detached per-origin intents without carrying a failed grant into an unrelated write. */
export class AuthorizationWrites {
  private base: AuthUrls;
  private intent: AuthUrls;
  private pending: Write[] = [];
  private dirty = false;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly versions = new Map<string, number>();

  constructor(
    initial: AuthUrls,
    private readonly persist: (entries: AuthUrls) => Promise<void>,
    private readonly publish: (entries: AuthUrls) => void
  ) {
    this.base = structuredClone(initial);
    this.intent = structuredClone(initial);
  }

  version(origin: string): number {
    return this.versions.get(origin) ?? 0;
  }

  mutate(update: (entries: AuthUrls) => void): Promise<AuthUrls> {
    const next = structuredClone(this.intent);
    update(next);
    return this.replace(next);
  }

  replace(next: AuthUrls, force = false): Promise<AuthUrls> {
    const changes: Changes = {};
    for (const origin of new Set([...Object.keys(this.intent), ...Object.keys(next)])) {
      if (force || JSON.stringify(this.intent[origin]) !== JSON.stringify(next[origin]))
        changes[origin] = structuredClone(next[origin]);
    }
    const origins = Object.keys(changes);
    if (!origins.length && !force && !this.dirty)
      return Promise.all(this.pending.map((write) => write.result)).then(() => structuredClone(this.intent));

    // A second change to an origin may depend on a first uncommitted grant.
    // If that predecessor fails, require a fresh explicit mutation rather than
    // persisting a whole entry assembled from the failed grant.
    const dependencies = this.pending.filter(
      (write) => this.valid(write) && origins.some((origin) => origin in write.changes)
    );
    const write: Write = { changes, dependencies, status: 'pending' };
    for (const origin of origins) this.versions.set(origin, this.version(origin) + 1);
    this.pending.push(write);
    this.refresh();
    const result = this.tail.then(async () => {
      try {
        if (!this.valid(write)) throw new Error('A preceding site authorization write failed; retry the change');
        const snapshot = structuredClone(this.base);
        apply(snapshot, changes);
        await this.persist(snapshot);
        this.base = snapshot;
        this.dirty = false;
        write.status = 'committed';
      } catch (error) {
        write.status = 'failed';
        apply(this.base, changes, true);
        this.dirty = true;
        throw error;
      } finally {
        this.pending = this.pending.filter((candidate) => candidate !== write);
        this.refresh();
      }
      return structuredClone(this.base);
    });
    write.result = result;
    this.tail = result.catch(() => undefined);
    return result;
  }

  private valid(write: Write): boolean {
    return write.status !== 'failed' && write.dependencies.every((dependency) => this.valid(dependency));
  }

  private refresh(): void {
    this.intent = structuredClone(this.base);
    const effective = structuredClone(this.base);
    for (const write of this.pending) {
      if (this.valid(write)) apply(this.intent, write.changes);
      apply(effective, write.changes, true);
    }
    this.publish(effective);
  }
}
