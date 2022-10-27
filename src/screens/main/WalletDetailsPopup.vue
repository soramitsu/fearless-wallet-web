<template>
  <Popup
    sizeWidth="mini"
    :showBorder="true"
    :showHeader="false"
    :showBlur="false"
    :showBackground="false"
    :handlerClose="close"
    :top="top"
    :left="300"
  >
    <div class="wallet-details">
      <div class="row" @click="openWalletDetails">
        <div class="label">Wallet Details</div>
      </div>
      <div class="row" @click="deleteWallet">
        <div class="label delete">Delete Wallet</div>
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Mutation } from 'vuex-class';
import type { SetSelectedWalletProps } from '@/store/accounts/types';
import type { TMutation } from '@/interfaces/common';
import Popup from '@/components/Popup.vue';
import BaseApi from '@/util/BaseApi';
import { Components } from '@/router/routes';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';

@Component({
  components: { Popup },
})
export default class WalletDetailsPopup extends Vue {
  @Prop(Number) buttonTopClick!: number;
  @Prop(String) selectedWalletAddress!: string;
  @Mutation(AccountsMutationTypes.SET_SELECTED_WALLET) setSelectedWallet!: TMutation<SetSelectedWalletProps>;

  get top() {
    return this.buttonTopClick - 46;
  }

  close() {
    this.$emit('close');
  }

  async deleteWallet() {
    const walletType = BaseApi.getWalletType(this.selectedWalletAddress);
    const walletsCount =
      walletType === 'native'
        ? await BaseApi.deleteNativeWallet(this.selectedWalletAddress)
        : await BaseApi.deleteMobileWallet(this.selectedWalletAddress);

    if (walletsCount === 0) this.$router.push({ name: Components.Welcome });
    else {
      this.setWallet();
      this.close();
    }
  }

  setWallet() {
    const selectedWalletAddress = BaseApi.getFirstSubstrateWalletAddress();

    if (selectedWalletAddress) this.setSelectedWallet({ selectedWalletAddress });
  }

  openWalletDetails() {
    this.setSelectedWallet({ selectedWalletAddress: this.selectedWalletAddress });

    this.$router.push({ name: Components.Accounts });

    this.$emit('closeSelectWalletPopup');
  }
}
</script>

<style lang="scss" scoped>
.wallet-details {
  color: $default-white;
  font-weight: 500;
  height: 60px;
  padding: 0 10px;

  .row {
    display: flex;
    margin-bottom: 16px;

    &:last-child {
      margin-bottom: 0;
    }

    &:hover {
      cursor: pointer;
      color: rgba(255, 255, 255, 0.9);

      .delete {
        opacity: 1;
      }
    }

    .label {
      margin: auto 0 auto 10px;
      width: 160px;
      text-align: left;
    }

    .delete {
      color: $delete-color;
      opacity: 0.8;
    }
  }
}
</style>
