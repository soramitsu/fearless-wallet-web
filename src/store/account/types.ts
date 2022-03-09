import type { CreateResult as AccountInfo } from '@polkadot/ui-keyring/types';

export type Account = AccountInfo | Record<string, never>;
