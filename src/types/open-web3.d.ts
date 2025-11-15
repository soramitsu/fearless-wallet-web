declare module '@open-web3/orml-type-definitions' {
  export const rpc: Record<string, unknown>;
  export const types: Record<string, unknown>;
  export const typesAlias: Record<string, unknown>;
}

declare module '@open-web3/orml-type-definitions/utils' {
  export function jsonrpcFromDefs(
    definitions: Record<string, unknown>,
    existingRpc?: Record<string, unknown>
  ): Record<string, unknown>;
  export function typesAliasFromDefs(
    definitions: Record<string, unknown>,
    existingAliases?: Record<string, unknown>
  ): Record<string, unknown>;
  export function typesFromDefs(definitions: Record<string, unknown>): Record<string, unknown>;
}
