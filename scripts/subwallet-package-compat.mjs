// Only adapt the fork's package-version diagnostic entrypoints. Their crypto,
// storage, signing, and address modules continue using the original packages.
const DETECTOR = /\/node_modules\/@subwallet\/(?:ui-)?keyring\/detectPackage\.js$/u;
const ORIGINAL_IMPORT = "import { detectPackage } from '@polkadot/util';";

export function subwalletPackageCompatPlugin() {
  return {
    name: 'fearless-subwallet-package-diagnostics',
    enforce: 'pre',
    transform(code, id) {
      if (!DETECTOR.test(id.split('?')[0].replaceAll('\\', '/'))) return null;
      if (!code.includes(ORIGINAL_IMPORT)) throw new Error(`Unexpected Subwallet diagnostic entrypoint: ${id}`);
      return {
        code: code.replace(
          ORIGINAL_IMPORT,
          "import { detectSubwalletPackage as detectPackage } from '@/util/detectSubwalletPackage';"
        ),
        map: null,
      };
    },
  };
}
