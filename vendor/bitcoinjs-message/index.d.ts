export function magicHash(message: string, messagePrefix?: string): never;
export function sign(message: string, privateKey: Uint8Array, compressed: boolean, messagePrefix?: string): never;
export function verify(message: string, address: string, signature: Uint8Array | string, messagePrefix?: string): never;
