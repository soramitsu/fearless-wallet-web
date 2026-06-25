import type { SolanaRequestsSubjectPayload } from '@extension-base/services/request-service/types';
import type {
  SolanaSignAndSendTransactionOptions,
  SolanaSignAndSendTransactionResponse,
  SolanaSigningResponse,
} from '@extension-base/page/types';
import { signSolanaSerializedTransaction } from '@/util/solanaTransaction';
import { signSolanaMessage } from '@/util/solanaKeyring';

type SolanaKeyringAccount = {
  address: string;
  meta: {
    isMobile?: unknown;
    name?: unknown;
    solanaAddress?: unknown;
    walletEcosystem?: unknown;
  };
};

type ExportMnemonic = (payload: { address: string; walletEcosystem: string }) => { seed?: string };
type BroadcastSolanaTransaction = (
  transactionBase64: string,
  options?: SolanaSignAndSendTransactionOptions
) => Promise<string>;
type SolanaSigningMaterial = {
  seed: string;
  solanaAddress: string;
};

const SUBSTRATE_ECOSYSTEM = 'substrate';
const SOLANA_ECOSYSTEM = 'solana';

export function findSolanaSigningAccount(
  accounts: SolanaKeyringAccount[],
  solanaAddress: string
): SolanaKeyringAccount | undefined {
  return accounts.find(({ address, meta }) => {
    const metaSolanaAddress = typeof meta.solanaAddress === 'string' ? meta.solanaAddress : undefined;
    const walletEcosystem = typeof meta.walletEcosystem === 'string' ? meta.walletEcosystem : undefined;

    return metaSolanaAddress === solanaAddress || (walletEcosystem === SOLANA_ECOSYSTEM && address === solanaAddress);
  });
}

export function resolveSolanaSigning({
  accounts,
  exportMnemonic,
  request,
}: {
  accounts: SolanaKeyringAccount[];
  exportMnemonic: ExportMnemonic;
  request: SolanaRequestsSubjectPayload;
}): SolanaSigningResponse {
  const { seed, solanaAddress } = resolveSolanaSigningMaterial({ accounts, exportMnemonic, request });

  if (request.method === 'signMessage') {
    if (!request.messageBase64) throw new Error('Invalid Solana message payload');

    const signature = signSolanaMessage({
      message: base64ToBytes(request.messageBase64),
      mnemonic: seed,
    });

    if (signature.address !== solanaAddress) throw new Error('Solana signing account mismatch');

    return {
      publicKey: signature.address,
      signatureBase58: signature.signatureBase58,
      signatureBase64: bytesToBase64(signature.signature),
    };
  }

  if (request.method === 'signTransaction') {
    if (!request.transactionBase64) throw new Error('Invalid Solana transaction payload');

    const signed = signSolanaSerializedTransaction({
      expectedSigner: solanaAddress,
      mnemonic: seed,
      transaction: request.transactionBase64,
    });

    return {
      publicKey: signed.signer,
      signatureBase58: signed.signatureBase58,
      signedTransactionBase64: signed.signedTransactionBase64,
    };
  }

  if (request.method === 'signAndSendTransaction') throw new Error('Solana broadcast function is required');

  if (!request.transactionsBase64) throw new Error('Invalid Solana transaction batch');

  const signedTransactions = request.transactionsBase64.map((transaction) =>
    signSolanaSerializedTransaction({
      expectedSigner: solanaAddress,
      mnemonic: seed,
      transaction,
    })
  );

  return {
    publicKey: solanaAddress,
    signedTransactionsBase64: signedTransactions.map(({ signedTransactionBase64 }) => signedTransactionBase64),
    signaturesBase58: signedTransactions.map(({ signatureBase58 }) => signatureBase58),
  };
}

export async function resolveSolanaSignAndSendTransaction({
  accounts,
  broadcastTransaction,
  exportMnemonic,
  request,
}: {
  accounts: SolanaKeyringAccount[];
  broadcastTransaction: BroadcastSolanaTransaction;
  exportMnemonic: ExportMnemonic;
  request: SolanaRequestsSubjectPayload;
}): Promise<SolanaSignAndSendTransactionResponse> {
  if (request.method !== 'signAndSendTransaction') throw new Error('Invalid Solana sign-and-send request');
  if (!request.transactionBase64) throw new Error('Invalid Solana transaction payload');

  const { seed, solanaAddress } = resolveSolanaSigningMaterial({ accounts, exportMnemonic, request });
  const signed = signSolanaSerializedTransaction({
    expectedSigner: solanaAddress,
    mnemonic: seed,
    transaction: request.transactionBase64,
  });
  const signature = await broadcastTransaction(signed.signedTransactionBase64, request.options);

  return {
    publicKey: signed.signer,
    signature,
    signatureBase58: signed.signatureBase58,
    signedTransactionBase64: signed.signedTransactionBase64,
  };
}

export const resolveSolanaMessageSigning = resolveSolanaSigning;

function resolveSolanaSigningMaterial({
  accounts,
  exportMnemonic,
  request,
}: {
  accounts: SolanaKeyringAccount[];
  exportMnemonic: ExportMnemonic;
  request: SolanaRequestsSubjectPayload;
}): SolanaSigningMaterial {
  const solanaAddress = request.account.address;
  const account = findSolanaSigningAccount(accounts, solanaAddress);

  if (!account) throw new Error('Unable to find Solana signing account');
  if (account.meta.isMobile) throw new Error('Solana mobile signing is not supported');

  const walletEcosystem =
    typeof account.meta.walletEcosystem === 'string' ? account.meta.walletEcosystem : SUBSTRATE_ECOSYSTEM;
  const { seed } = exportMnemonic({ address: account.address, walletEcosystem });

  if (!seed) throw new Error('Unable to export Solana signing seed');

  return { seed, solanaAddress };
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'base64'));
}

function bytesToBase64(value: Uint8Array): string {
  return Buffer.from(value).toString('base64');
}

export type { SolanaKeyringAccount };
