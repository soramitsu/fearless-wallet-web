import type { TonImportCandidateInfo } from '@extension-base/background/types/types';

// The address offered first: the only one that holds funds or has history, otherwise the address
// new wallets get (the first candidate).
function preselectTonImportCandidate(candidates: TonImportCandidateInfo[]): TonImportCandidateInfo | undefined {
  const used = candidates.filter(({ activity }) => activity === 'active');

  return used.length === 1 ? used[0] : candidates[0];
}

// True when the preselection is only a default: no address is known to be in use and at least one
// could not be checked, so the user has to recognise their address themselves.
function isTonImportUnchecked(candidates: TonImportCandidateInfo[]): boolean {
  return (
    !candidates.some(({ activity }) => activity === 'active') && candidates.some(({ activity }) => activity === 'unknown')
  );
}

export { isTonImportUnchecked, preselectTonImportCandidate };
