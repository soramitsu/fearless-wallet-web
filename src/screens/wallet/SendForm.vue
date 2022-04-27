<template>
  <ActivityForm header="Send Funds" buttonText="Send" :handlerButton="send" :closeForm="closeForm" class="send-form">
    <div class="send-form-content">
      <div>
        <Select v-model="walletAddress" :options="optionsWallets" placeholder="Send from" size="big" class="row" />

        <Select v-model="network" :options="optionsNetwork" placeholder="Network" size="big" class="row" />

        <Input v-model="recipient" placeholder="Send to" size="big" class="row" />

        <Input v-model="countTokens" placeholder="Amount to send" size="big" class="row" />
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
import Input from '@/components/Input.vue';
import Select from '@/components/Select.vue';
import ActivityForm from './ActivityForm.vue';
import keyring from '@polkadot/ui-keyring';

@Component({
  components: {
    ActivityForm,
    Input,
    Select,
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
