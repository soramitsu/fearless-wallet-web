import { typesBundle as soraTypesBundle, types as soraTypes, typesAlias as soraTypeAlias, rpc as soraRpc } from './raw';
import {
  OverrideBundleType,
  OverrideModuleType,
  RegistryTypes,
  DefinitionRpc,
  DefinitionRpcSub,
} from '@polkadot/types/types';

export const types: RegistryTypes = soraTypes;

export const rpc = soraRpc as Record<string, Record<string, DefinitionRpc | DefinitionRpcSub>>;

export const typesAlias = soraTypeAlias as Record<string, OverrideModuleType>;

export const typesBundle = soraTypesBundle as OverrideBundleType;
