export interface SoraPairBinding {
  address?: string;
  meta?: Record<string, unknown>;
}

type SoraAddressFormatter = (address: string) => string;

function sameSoraAddress(
  pairAddress: string,
  selectedAddress: string,
  formatAddress: SoraAddressFormatter
): boolean {
  if (pairAddress === selectedAddress) return true;

  try {
    return formatAddress(pairAddress) === formatAddress(selectedAddress);
  } catch {
    return false;
  }
}

export function isLocallySignableSelectedSoraPair(
  pair: SoraPairBinding | undefined,
  selectedAddress: string | undefined,
  formatAddress: SoraAddressFormatter
): boolean {
  const address = pair?.address;
  const meta = pair?.meta ?? {};

  return Boolean(
    address &&
      selectedAddress &&
      sameSoraAddress(address, selectedAddress, formatAddress) &&
      !meta.isExternal &&
      !meta.isInjected &&
      !meta.isHardware &&
      !meta.isMobile
  );
}

export function isCapturedSoraPairStillSelected(
  capturedPair: SoraPairBinding | undefined,
  currentPair: SoraPairBinding | undefined,
  selectedAddress: string | undefined,
  formatAddress: SoraAddressFormatter
): boolean {
  return capturedPair === currentPair &&
    isLocallySignableSelectedSoraPair(currentPair, selectedAddress, formatAddress);
}
