<template>
  <div class="export-form">
    <Loader v-if="isLoading" />

    <div v-else-if="errorKey" class="export-blocked" data-testid="exportBlocked">
      <p class="export-blocked__message" role="alert" data-testid="exportError">{{ $t(errorKey) }}</p>

      <div class="export-blocked__actions">
        <FButton
          v-if="canUnlockAccount"
          size="big"
          fontSize="big"
          width="100%"
          text="accountAccess.unlockAccount"
          data-testid="unlockAccountBtn"
          @click="openAccountAccess"
        />

        <FButton
          size="big"
          fontSize="big"
          width="100%"
          type="secondary"
          text="ux.back"
          data-testid="exportBackBtn"
          @click="$emit('closeHandler')"
        />
      </div>
    </div>

    <template v-else>
      <div class="export-content">
        <div v-if="isMnemonic">
          <MnemonicBackupForm :mnemonicArray="mnemonicArray" :mnemonicLength="mnemonicLength">
            <Hint
              v-if="hasUniversalWalletPassword"
              class="as-typed-hint"
              iconName="warning"
              text="ux.universalWalletPasswordBackup"
              role="note"
              data-testid="universalWalletPasswordBackup"
            />
            <Hint
              v-if="isPhraseAsTyped"
              class="as-typed-hint"
              iconName="warning"
              text="ux.tonPhraseAsTyped"
              role="note"
              data-testid="tonPhraseAsTyped"
            />
          </MnemonicBackupForm>
        </div>

        <template v-else>
          <FInput
            :value="exportTypeText"
            placeholder="common.sourceType"
            size="big"
            class="export-type-input"
            data-testid="exportTypeInput"
            :readonly="true"
          />

          <FInput
            :value="isRowSeed ? seed : substrateAddress"
            class="row"
            size="big"
            data-testid="addressInput"
            :placeholder="placeholder"
            :readonly="true"
          />
        </template>
      </div>

      <FButton size="big" fontSize="big" width="100%" :text="text" data-testid="exportBtn" @click="proceed" />
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';


import type { KeyringPair$Json } from '@subwallet/keyring/types';
import BaseApi from '@/util/BaseApi';
import { exportJSON, exportMnemonic, exportRowSeed, universalWalletPasswordStatus } from '@/extension/messaging';
import { isSameString, setClipboard } from '@/helpers';
import { downloadJsonAccount } from '@/helpers/files';
import { getAccountAccessErrorLocaleKey } from '@/helpers/transferErrors';
import { Components } from '@/router/routes';
import { WalletEcosystem } from '@/interfaces';
import MnemonicBackupForm from '@/screens/addWallet/MnemonicBackupForm.vue';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { isTonPhraseIrregular } from '@/util/tonKeyring';

enum ExportTypeTextKey {
  mnemonic = 'accounts.mnemonic',
  rawSeed = 'accounts.rawSeed',
  json = 'accounts.json',
}

export default defineComponent({ name: 'ExportForm', components: { MnemonicBackupForm } ,
  props: {
    password: String,
    exportType: String,
  },
  emits: ['closeHandler'],
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      json: {} as KeyringPair$Json,
      isLoading: false,
      seed: '',
      hasUniversalWalletPassword: false,
      /** Why the export could not run; the screen then offers the next step instead of a phrase. */
      errorKey: '',
      canUnlockAccount: false,
    };
  },
  computed: {
    exportTypeText() {
      return this.$t(ExportTypeTextKey[this.exportType]);
    },
    mnemonicLength() {
      return this.mnemonicArray.length;
    },
    mnemonicArray() {
      return this.seed.split(' ');
    },
    isMnemonic() {
      return this.exportType === 'mnemonic';
    },
    // A TON phrase stored with its own spacing and capitals is shown and copied exactly as stored, and
    // only opens the wallet when typed that way.
    isPhraseAsTyped() {
      return this.accountsStore.selectedWallet.walletEcosystem === WalletEcosystem.Ton && isTonPhraseIrregular(this.seed);
    },
    isRowSeed() {
      return this.exportType === 'rawSeed';
    },
    isJson() {
      return this.exportType === 'json';
    },
    network() {
      return this.$route.params.network ?? this.$route.params.selectedNetwork;
    },
    text() {
      return this.isJson ? 'accounts.downloadFile' : 'common.copyToClipboard';
    },
    isEthereumNetwork() {
      return BaseApi.isEthereumNetwork(this.network);
    },
    placeholder() {
      return this.isEthereumNetwork ? 'Ethereum' : 'Substrate';
    },
    substrateAddress() {
      const json = Object.entries(this.json)
            .sort(([key]) => (key === 'address' ? -1 : 0))
            .reduce((result, [key, value]) => ({ ...result, [key]: value }), {});

          return JSON.stringify(json);
    },
    addressByNetwork() {
      return BaseApi.formatAddress(this.accountsStore.selectedWallet, this.network);
    },
    /** The key this export opens, which is the account Account access unlocks. */
    exportedAccount(): { address: string; walletEcosystem?: WalletEcosystem } {
      const { address, walletEcosystem } = this.accountsStore.selectedWallet;

      if (this.isMnemonic) return { address, walletEcosystem };
      if (this.isRowSeed && this.isEthereumNetwork) return { address: this.addressByNetwork, walletEcosystem: WalletEcosystem.Evm };

      return { address: this.addressByNetwork, walletEcosystem };
    },
  },
  async mounted() {
    this.isLoading = true;

    try {
      if (this.isMnemonic) {
        const { address, walletEcosystem } = this.exportedAccount;
        const { seed } = await exportMnemonic(address, this.password, walletEcosystem);

        this.seed = seed;
        // The words alone no longer restore Bitcoin, Solana, TON and Taira of a wallet with a password.
        this.hasUniversalWalletPassword = await (async () => {
          const { state } = await universalWalletPasswordStatus(address);

          return state === 'protected' || state === 'legacy';
        })().catch(() => false);
      } else if (this.isRowSeed) {
        const { seed } = await exportRowSeed(this.addressByNetwork, this.password, this.isEthereumNetwork);

        this.seed = seed;
      } else {
        const { json } = await exportJSON(this.addressByNetwork, this.password, this.network);

        this.json = json;
      }
    } catch (error) {
      // A key that waits for a password used before can be unlocked in Account access; nothing was exported.
      const accessErrorKey = getAccountAccessErrorLocaleKey(error);

      this.errorKey = accessErrorKey ?? 'accounts.exportFailed';
      this.canUnlockAccount = accessErrorKey !== undefined;
    } finally {
      this.isLoading = false;
    }
  },
  methods: {
    // Account access lists that account's rows first (an address is unique across ecosystems).
    openAccountAccess() {
      this.$router.push({ name: Components.AccountAccessRecovery, query: { address: this.exportedAccount.address } });
    },
    proceed() {
      if (this.isMnemonic || this.isRowSeed) setClipboard(this.seed);
          else this.downloadJsonFile();
    },
    async downloadJsonFile() {
      const chainId = this.networksStore.networks.find(({ name }) => isSameString(name, this.network))!.chainId;
          const meta = { ...this.json.meta, genesisHash: `0x${chainId}` } as unknown as Record<string, string>;

          downloadJsonAccount(this.addressByNetwork, this.json, meta);
    },
  },
});
</script>

<style lang="scss" scoped>
.export-form {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .export-content {
    display: flex;
    flex-direction: column;
  }

  .export-type-input {
    width: 100%;
  }

  .row {
    margin-top: 16px;
  }

  .export-blocked {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 16px;
    height: 100%;
  }

  .export-blocked__message {
    margin: 0;
    color: $grayish-white;
    line-height: 1.4;
    text-align: left;
    overflow-wrap: anywhere;
  }

  .export-blocked__actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .as-typed-hint {
    border-radius: $default-border-radius;
    padding: 8px 16px;
    background-color: rgba(255, 255, 255, 0.24);
  }
}
</style>
