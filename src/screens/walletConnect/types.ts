import { type ProposalTypes } from '@walletconnect/types';

export type WalletConnectRequestProps = {
  id: string;
  accounts: string[];
  isSupported: boolean;
};

export type ChainData = {
  name: string;
  icon: string;
  connected: boolean;
};

export type SessionProposalNamespaces = ProposalTypes.RequiredNamespaces | ProposalTypes.OptionalNamespaces;
