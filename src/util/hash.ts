import { sha256 } from 'js-sha256';

// not currently in use
// may need to be removed
export class Hash {
  static sha256(value: string) {
    return sha256(value);
  }

  static isSameAs(value: string, _hashValue: string) {
    const hashValue = this.sha256(value);

    return hashValue === _hashValue;
  }
}
