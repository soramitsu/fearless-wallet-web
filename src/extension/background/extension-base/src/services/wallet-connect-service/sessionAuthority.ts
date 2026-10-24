import WalletConnectRetiredSessions, { sessionIsApproved } from '@extension-base/stores/WalletConnectRetiredSessions';
import type { RetirementRecord } from '@extension-base/stores/WalletConnectRetiredSessions';

// Both WalletConnect roles in a worker share a local veto and the same durable
// approval generation. SDK persistence alone cannot grant a post-reset session.
class SessionAuthority {
  revision = 0;
  private blocked = false;
  private policyRevision = 0;
  private policy: RetirementRecord = { version: 1, topics: [] };

  allows(topic: string): boolean {
    return !this.blocked && sessionIsApproved(this.policy, topic);
  }

  async load(): Promise<void> {
    const revision = this.revision;
    const policyRevision = this.policyRevision;
    const policy = await new WalletConnectRetiredSessions().readPolicy();
    if (this.revision === revision && this.policyRevision === policyRevision && !this.blocked) {
      this.policy = policy;
      this.policyRevision++;
    }
  }

  async reset(topics: string[]): Promise<void> {
    const revision = ++this.revision;
    this.blocked = true;
    const policy = await new WalletConnectRetiredSessions().reset(topics);
    if (this.revision === revision) {
      this.policy = policy;
      this.policyRevision++;
      this.blocked = false;
    }
  }

  async approve(topic: string, assertCurrent: () => void): Promise<void> {
    const revision = this.revision;
    const assertApproval = () => {
      assertCurrent();
      if (this.blocked || this.revision !== revision) throw new Error('Wallet changed during session approval');
    };
    assertApproval();
    const policy = await new WalletConnectRetiredSessions().approve(topic, this.policy.generation ?? 0, assertApproval);
    assertApproval();
    this.policy = policy;
    this.policyRevision++;
  }
}

const authorities = new WeakMap<object, SessionAuthority>();
export function sessionAuthority(state: object): SessionAuthority {
  let authority = authorities.get(state);
  if (!authority) {
    authority = new SessionAuthority();
    authorities.set(state, authority);
  }
  return authority;
}
