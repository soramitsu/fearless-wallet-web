import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import type { FWKeyringMeta } from '@extension-base/types';
import { CURRENT_WALLET_SECURITY_GENERATION, WALLET_GENERATION_EXPIRED_ERROR } from '@/util/walletSecurity';

/** Runtime-only evidence; never retain phrases or persist their fingerprints. */
export class WalletSecurityProvenance {
  private readonly issuedRoots = new Set<string>();

  rememberGeneratedMnemonic(mnemonic: string): void {
    this.issuedRoots.add(this.fingerprint(mnemonic));
    // Allow a root's EVM child and parent to be saved independently, while
    // bounding abandoned account-creation sessions in a long-lived worker.
    if (this.issuedRoots.size > 32) this.issuedRoots.delete(this.issuedRoots.values().next().value!);
  }

  accountMetadata(suri: string, meta: FWKeyringMeta, requireFreshGeneration = false): FWKeyringMeta {
    const clean = withoutWalletSecurityClaims(meta);
    if (this.issuedRoots.has(this.fingerprint(suri))) {
      clean.walletSecurityGeneration = CURRENT_WALLET_SECURITY_GENERATION;
    } else if (requireFreshGeneration) {
      throw new Error(`${WALLET_GENERATION_EXPIRED_ERROR}: Start creating a new wallet again.`);
    }
    return clean;
  }

  private fingerprint(suri: string): string {
    // Derivation junctions and optional passwords follow the phrase after '/'.
    // Only a root actually issued by this worker can match the registry.
    const phrase = suri.split('/')[0].trim().split(/\s+/).join(' ');
    return bytesToHex(sha256(utf8ToBytes(phrase)));
  }
}

export function withoutWalletSecurityGeneration(meta: FWKeyringMeta): FWKeyringMeta {
  const clean = { ...meta };
  delete clean.walletSecurityGeneration;
  return clean;
}

/** Secret-bearing imports are local accounts, regardless of backup claims. */
export function withoutWalletSecurityClaims(meta: FWKeyringMeta): FWKeyringMeta {
  const clean = withoutWalletSecurityGeneration(meta);
  for (const key of ['isExternal', 'isHardware', 'isInjected', 'isMobile', 'isReadOnly', 'isWatchOnly', 'noPublicKey']) {
    delete clean[key];
  }
  return clean;
}
