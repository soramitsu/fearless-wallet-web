<template>
  <ActivityForm header="Send Funds" buttonText="Send" :handlerButton="send" :closeForm="closeForm" class="send-form">
    <div class="send-form-content">
      <div>
        <s-select v-model="walletAddress" placeholder="Send from" size="big" class="row">
          <s-option v-for="{ value, label } in optionsWallets" :key="value" :value="value" :label="label" />
        </s-select>
        <!-- <div class="wallet-address">{{ walletAddress }}</div> -->
        <s-select v-model="network" placeholder="Network" size="big" class="row">
          <s-option v-for="{ value, label } in optionsNetwork" :key="value" :value="value" :label="label" />
        </s-select>
        <s-input v-model="recipient" placeholder="Send to" size="big" class="row" />
        <s-input v-model="countTokens" placeholder="Amount to send" size="big" class="row" />
      </div>
    </div>

    <template #fee>
      <div class="fee">
        Network fee <span class="fee-value">{{ feeValue }} {{ tokenName }}</span> ${{ feeValueDollars }}
      </div>
    </template>
  </ActivityForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as ApisGettersTypes } from '@/store/api/getters';
import { Networks } from '@/store/api/types';
import ActivityForm from './ActivityForm.vue';
import keyring from '@polkadot/ui-keyring';

@Component({
  components: {
    ActivityForm,
  },
})
export default class extends Vue {
  walletAddress = '';
  network = '';
  recipient = '';
  countTokens = '';
  tokenName = 'KSM';
  feeValue = 0.1618;

  @Prop(Function) closeForm!: VoidFunction;
  @Getter(ApisGettersTypes.getNetworksInfo) networksInfo!: Networks;

  get feeValueDollars() {
    return 2.45;
  }

  get optionsWallets() {
    return keyring.getAccounts().map(({ address, meta: { name } }) => {
      return { label: name, value: address };
    });
  }

  get optionsNetwork() {
    return Object.keys(this.networksInfo).map((network) => {
      return { label: network, value: network };
    });
  }

  send() {
    return 1;
  }
}
</script>

<style lang="scss" scoped>
.send-form {
  .send-form-content {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 85%;
  }

  .row {
    margin-top: 16px;

    &:first-child {
      margin-top: 0;
    }
  }

  .wallet-address {
    position: absolute;
    font-weight: 300;
    font-size: 12px;
    top: 220px;
  }

  .fee {
    font-weight: 300;
    font-size: 15px;
  }

  .fee-value {
    font-weight: 700;
    color: var(--pink-lavender-color);
  }
}
</style>
