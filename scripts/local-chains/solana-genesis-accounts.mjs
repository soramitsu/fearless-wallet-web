// Genesis accounts for the local-chain Solana send tests: a funded wallet, an
// SPL mint and the wallet's associated token account holding that mint. Loaded
// into solana-test-validator with `--account`, so no CLI tooling or faucet is
// needed and nothing touches a public cluster.

import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2';
import { base58 } from '@scure/base';

export const SYSTEM_PROGRAM = '11111111111111111111111111111111';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const ASSOCIATED_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

const MINT_BYTES = 82;
const TOKEN_ACCOUNT_BYTES = 165;
const MINT_RENT_LAMPORTS = 1_461_600;
const TOKEN_ACCOUNT_RENT_LAMPORTS = 2_039_280;

const u64 = (value) => {
  const bytes = Buffer.alloc(8);

  bytes.writeBigUInt64LE(BigInt(value));

  return bytes;
};

const isOnCurve = (bytes) => {
  try {
    ed25519.ExtendedPoint.fromHex(bytes);

    return true;
  } catch {
    return false;
  }
};

export function findAssociatedTokenAddress(owner, mint) {
  for (let bump = 255; bump >= 0; bump -= 1) {
    const candidate = sha256(
      Buffer.concat([
        base58.decode(owner),
        base58.decode(TOKEN_PROGRAM),
        base58.decode(mint),
        Buffer.from([bump]),
        base58.decode(ASSOCIATED_TOKEN_PROGRAM),
        Buffer.from('ProgramDerivedAddress'),
      ])
    );

    if (!isOnCurve(candidate)) return base58.encode(candidate);
  }

  throw new Error('no associated token address');
}

export const randomSolanaAddress = () => base58.encode(ed25519.getPublicKey(randomBytes(32)));

const accountJson = (pubkey, { data = Buffer.alloc(0), lamports, owner }) => ({
  account: {
    data: [data.toString('base64'), 'base64'],
    executable: false,
    lamports,
    owner,
    rentEpoch: 0,
    space: data.length,
  },
  pubkey,
});

/**
 * Writes the account files and returns the `--account` arguments plus the
 * addresses the tests need.
 */
export async function writeSolanaGenesisAccounts({ directory, wallet, walletLamports, tokenDecimals = 6, tokenAmount }) {
  const mint = randomSolanaAddress();
  const mintAuthority = randomSolanaAddress();
  const walletTokenAccount = findAssociatedTokenAddress(wallet, mint);
  const mintData = Buffer.concat([
    Buffer.from([1, 0, 0, 0]),
    Buffer.from(base58.decode(mintAuthority)),
    u64(tokenAmount),
    Buffer.from([tokenDecimals, 1]),
    Buffer.alloc(36),
  ]);
  const tokenAccountData = Buffer.concat([
    Buffer.from(base58.decode(mint)),
    Buffer.from(base58.decode(wallet)),
    u64(tokenAmount),
    Buffer.alloc(36),
    Buffer.from([1]),
    Buffer.alloc(12),
    u64(0),
    Buffer.alloc(36),
  ]);

  if (mintData.length !== MINT_BYTES || tokenAccountData.length !== TOKEN_ACCOUNT_BYTES) {
    throw new Error('unexpected SPL account layout');
  }

  const accounts = [
    [wallet, accountJson(wallet, { lamports: walletLamports, owner: SYSTEM_PROGRAM })],
    [mint, accountJson(mint, { data: mintData, lamports: MINT_RENT_LAMPORTS, owner: TOKEN_PROGRAM })],
    [walletTokenAccount, accountJson(walletTokenAccount, { data: tokenAccountData, lamports: TOKEN_ACCOUNT_RENT_LAMPORTS, owner: TOKEN_PROGRAM })],
  ];
  const args = [];

  await fs.mkdir(directory, { recursive: true });

  for (const [pubkey, json] of accounts) {
    const file = path.join(directory, `${pubkey}.json`);

    await fs.writeFile(file, `${JSON.stringify(json)}\n`);
    args.push('--account', pubkey, file);
  }

  return { args, mint, walletTokenAccount };
}
