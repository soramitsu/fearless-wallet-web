interface AvailableInNetworks {
  network: string;
  balance: number;
}

export interface Currency {
  mainNetwork: string;
  token: string;
  price: number;
  grown: number;
  grownPercent: number;
  availableInNetworks: AvailableInNetworks[];
}
