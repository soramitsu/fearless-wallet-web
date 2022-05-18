export interface AvailableInNetworks {
  network: string;
  balance: number;
}

export interface Currency {
  walletAddress?: string;
  mainNetwork: string;
  token: string;
  price: number;
  grown: number;
  grownPercent: number;
  availableInNetworks: AvailableInNetworks[];
}

export type Currencies = Currency[];

export interface HistoryItem {
  id: string;
  type: string;
  value: number;
  token: string;
  time: number;
}
