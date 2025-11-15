import { readFileSync } from 'fs';
import path from 'path';
import { SubNetworkId } from '@sora-substrate/util/src/bridgeProxy/sub/consts';

const METADATA_ENVIRONMENTS = ['dev', 'test', 'stage', 'prod'] as const;
const EXPECTED_NETWORKS = Object.values(SubNetworkId).map(String);

const readJson = (env: (typeof METADATA_ENVIRONMENTS)[number], fileName: string) => {
  const filePath = path.resolve(__dirname, '../../src/sora/typeDefinitions/metadata', env, fileName);

  return JSON.parse(readFileSync(filePath, 'utf8')) as any;
};

const expectContainsAllNetworks = (candidates: string[]) => {
  EXPECTED_NETWORKS.forEach((variant) => {
    expect(candidates).toContain(variant);
  });
};

describe('Sora bridge metadata', () => {
  METADATA_ENVIRONMENTS.forEach((env) => {
    describe(`${env} metadata`, () => {
      it('types.json enumerates every SubNetworkId variant', () => {
        const metadata = readJson(env, 'types.json');
        const enumRecord = metadata.SubNetworkId?._enum ?? {};

        expectContainsAllNetworks(Object.keys(enumRecord));
      });

      it('types_subsquid.json enumerates every SubNetworkId variant', () => {
        const metadata = readJson(env, 'types_subsquid.json');
        const enumRecord = metadata.types?.SubNetworkId?._enum ?? {};

        expectContainsAllNetworks(Object.keys(enumRecord));
      });

      type VersionedSection = {
        types?: {
          SubNetworkId?: {
            type_mapping?: [string, unknown][];
            value_list?: string[];
          };
        };
      };

      it('types_scalecodec_python.json enumerates every SubNetworkId variant', () => {
        const metadata = readJson(env, 'types_scalecodec_python.json');
        const versioning = Array.isArray(metadata.versioning) ? metadata.versioning : [];

        versioning.forEach((section: VersionedSection) => {
          const definition = section.types?.SubNetworkId;
          if (!definition) return;

          const mapping = Array.isArray(definition.type_mapping)
            ? definition.type_mapping.map(([name]: [string, unknown]) => name)
            : Array.isArray(definition.value_list)
              ? definition.value_list
              : [];

          expectContainsAllNetworks(mapping);
        });
      });

      it('types_scalecodec_mobile.json enumerates every SubNetworkId variant', () => {
        const metadata = readJson(env, 'types_scalecodec_mobile.json');
        const versioning = Array.isArray(metadata.versioning) ? metadata.versioning : [];

        versioning.forEach((section: VersionedSection) => {
          const definition = section.types?.SubNetworkId;
          if (!definition) return;

          const mapping = Array.isArray(definition.type_mapping)
            ? definition.type_mapping.map(([name]: [string, unknown]) => name)
            : Array.isArray(definition.value_list)
              ? definition.value_list
              : [];

          expectContainsAllNetworks(mapping);
        });
      });
    });
  });
});
