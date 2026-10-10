import type { SolanaParsedAccount, SolanaRpcClient } from '@extension-base/services/solana-rpc-service';
import type {
  SolanaTokenBalance,
  SolanaTokenMetadata,
  SolanaTokenMetadataBatchResponse,
  SolanaTokenTransferFeeConfig,
  SolanaTokenTransferHook,
  SolanaWalletBalancesResponse,
} from '@extension-base/services/solana-indexer-service';

const SPL_TOKEN_PROGRAM_ADDRESS = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ADDRESS = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const LAMPORTS_PER_SOL = 1_000_000_000n;

type SolanaRpcBalanceSource = Pick<SolanaRpcClient, 'getBalance' | 'getMultipleAccounts' | 'getTokenAccountsByOwner'>;

type ParsedInfo = Record<string, unknown>;

const record = (value: unknown): ParsedInfo =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as ParsedInfo) : {};

const optionalString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const parsedInfo = (account: SolanaParsedAccount): { info: ParsedInfo; type?: string } => {
  const parsed = record(record(account.data).parsed);

  return { info: record(parsed.info), type: typeof parsed.type === 'string' ? parsed.type : undefined };
};

const formatLamports = (lamports: bigint): string => {
  const fraction = (lamports % LAMPORTS_PER_SOL).toString().padStart(9, '0').replace(/0+$/u, '');

  return fraction ? `${lamports / LAMPORTS_PER_SOL}.${fraction}` : (lamports / LAMPORTS_PER_SOL).toString();
};

const toTokenBalance = (pubkey: string, account: SolanaParsedAccount, programId: string): SolanaTokenBalance | null => {
  const { info, type } = parsedInfo(account);
  const tokenAmount = record(info.tokenAmount);

  if (type !== 'account' || typeof info.mint !== 'string' || typeof tokenAmount.amount !== 'string') return null;
  if (!/^\d+$/u.test(tokenAmount.amount) || !Number.isInteger(tokenAmount.decimals)) return null;

  return {
    accountAddress: pubkey,
    amount: tokenAmount.amount,
    decimals: tokenAmount.decimals as number,
    delegatedAmount: optionalString(record(info.delegatedAmount).amount),
    isNative: info.isNative === true,
    mint: info.mint,
    owner: typeof info.owner === 'string' ? info.owner : '',
    program: programId === TOKEN_2022_PROGRAM_ADDRESS ? 'token-2022' : 'spl-token',
    programId,
    rentExemptReserve: optionalString(record(info.rentExemptReserve).amount),
    state: optionalString(info.state),
    type: 'token',
    uiAmountString: typeof tokenAmount.uiAmountString === 'string' ? tokenAmount.uiAmountString : tokenAmount.amount,
  };
};

const extensionState = (extensions: unknown[], name: string): ParsedInfo | null => {
  const found = extensions.map(record).find(({ extension }) => extension === name);

  return found ? record(found.state) : null;
};

const toTokenMetadata = (mint: string, account: SolanaParsedAccount | null, syncedAt: number): SolanaTokenMetadata => {
  const empty: SolanaTokenMetadata = {
    decimals: null,
    exists: false,
    extensions: [],
    freezeAuthority: null,
    isInitialized: null,
    mint,
    mintAuthority: null,
    name: null,
    program: 'unknown',
    programId: null,
    supply: null,
    symbol: null,
    syncedAt,
    transferFeeConfig: null,
    transferHook: null,
    uiSupplyString: null,
    uri: null,
  };

  if (!account) return empty;

  const { info, type } = parsedInfo(account);
  const program =
    account.owner === SPL_TOKEN_PROGRAM_ADDRESS ? 'spl-token' : account.owner === TOKEN_2022_PROGRAM_ADDRESS ? 'token-2022' : 'unknown';

  if (type !== 'mint' || program === 'unknown') return { ...empty, exists: true, programId: account.owner };

  const extensions = Array.isArray(info.extensions) ? info.extensions : [];
  const metadata = extensionState(extensions, 'tokenMetadata');
  const transferFee = extensionState(extensions, 'transferFeeConfig');
  const transferHook = extensionState(extensions, 'transferHook');

  return {
    ...empty,
    decimals: Number.isInteger(info.decimals) ? (info.decimals as number) : null,
    exists: true,
    extensions: extensions
      .map((entry) => record(entry).extension)
      .filter((name): name is string => typeof name === 'string'),
    freezeAuthority: optionalString(info.freezeAuthority),
    isInitialized: typeof info.isInitialized === 'boolean' ? info.isInitialized : null,
    mintAuthority: optionalString(info.mintAuthority),
    name: optionalString(metadata?.name),
    program,
    programId: account.owner,
    supply: optionalString(info.supply),
    symbol: optionalString(metadata?.symbol),
    transferFeeConfig: transferFee ? (transferFee as unknown as SolanaTokenTransferFeeConfig) : null,
    transferHook: transferHook ? (transferHook as unknown as SolanaTokenTransferHook) : null,
    uri: optionalString(metadata?.uri),
  };
};

/**
 * Wallet balances read straight from Solana JSON-RPC (native SOL plus SPL Token
 * and Token-2022 accounts), in the same shape the indexer used, so balances
 * never depend on the si.soramitsu.io indexer. Empty token accounts are left
 * out. Classic SPL tokens get their names from the registry; Token-2022 mints
 * may carry their own name and symbol.
 */
export function createSolanaRpcBalanceClient(rpc: SolanaRpcBalanceSource) {
  return {
    async getBalances(wallet: string): Promise<SolanaWalletBalancesResponse> {
      const [lamports, splAccounts, token2022Accounts] = await Promise.all([
        rpc.getBalance(wallet),
        rpc.getTokenAccountsByOwner(wallet, SPL_TOKEN_PROGRAM_ADDRESS),
        rpc.getTokenAccountsByOwner(wallet, TOKEN_2022_PROGRAM_ADDRESS),
      ]);
      const tokens = [
        ...splAccounts.map(({ account, pubkey }) => toTokenBalance(pubkey, account, SPL_TOKEN_PROGRAM_ADDRESS)),
        ...token2022Accounts.map(({ account, pubkey }) => toTokenBalance(pubkey, account, TOKEN_2022_PROGRAM_ADDRESS)),
      ].filter((token): token is SolanaTokenBalance => token !== null && token.amount !== '0');

      return {
        native: {
          decimals: 9,
          lamports: lamports.toString(),
          mint: 'SOL',
          type: 'native',
          uiAmountString: formatLamports(BigInt(lamports)),
        },
        syncedAt: Date.now(),
        tokens,
        total: tokens.length + 1,
        wallet,
      };
    },

    async getTokenMetadataBatch(mints: string[]): Promise<SolanaTokenMetadataBatchResponse> {
      const syncedAt = Date.now();
      const accounts = await rpc.getMultipleAccounts(mints);

      return {
        syncedAt,
        tokens: mints.map((mint, index) => toTokenMetadata(mint, accounts[index], syncedAt)),
        total: mints.length,
      };
    },
  };
}
