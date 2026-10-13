import type { NetworkJson } from '@extension-base/types';

export type NodePreferences = Pick<NetworkJson, 'currentProvider' | 'customNodes' | 'customProviders' | 'isManual'>;
export type NetworkMapEdit = NetworkJson | { network: NetworkJson; expected: NodePreferences };

export function nodePreferences(network: NodePreferences): NodePreferences {
  return { currentProvider: network.currentProvider, customNodes: network.customNodes ?? [],
    customProviders: network.customProviders, isManual: network.isManual ?? false };
}

export function sameNodePreferences(current: NodePreferences, expected: NodePreferences): boolean {
  return JSON.stringify(nodePreferences(current)) === JSON.stringify(nodePreferences(expected));
}
