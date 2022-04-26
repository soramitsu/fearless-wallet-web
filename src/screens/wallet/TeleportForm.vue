<template>
  <ActivityForm header="Teleport" buttonText="Send" :handlerButton="send" :closeForm="closeForm" class="teleport-form">
    <div class="teleport-form-content">
      <s-select v-model="walletAddress" placeholder="Send from" size="big" class="row">
        <s-option v-for="{ value, label } in optionsWallets" :key="value" :value="value" :label="label" />
      </s-select>

      <div class="row select-networks">
        <s-select v-model="originNetwork" placeholder="Origin network" size="big">
          <s-option v-for="{ value, label } in optionsNetwork" :key="value" :value="value" :label="label" />
        </s-select>

        <s-icon name="arrows-arrow-right-24" />

        <s-select v-model="destinationNetwork" placeholder="Destination network" size="big">
          <s-option v-for="{ value, label } in optionsNetwork" :key="value" :value="value" :label="label" />
        </s-select>
      </div>

      <s-input v-model="amount" placeholder="Amount to send" size="big" class="row" />
    </div>

    <template #fee>
      Network fee <span class="fee-value">{{ feeValue }} {{ tokenName }}</span> ${{ feeValueDollars }}
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
  originNetwork = '';
  destinationNetwork = '';
  amount = '';
  tokenName = 'KSM';
  feeValue = 0.1618;

  @Prop(Function) closeForm!: VoidFunction;
  @Getter(ApisGettersTypes.getNetworksInfo) networksInfo!: Networks;

  get optionsWallets() {
    return keyring.getAccounts().map(({ address, meta: { name } }) => {
      return { label: name, value: address };
    });
  }

  get feeValueDollars() {
    return 2.45;
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
.teleport-form {
  .teleport-form-content {
    .row {
      margin-top: 16px;

      &:first-child {
        margin-top: 0;
      }
    }

    .select-networks {
      display: flex;
      justify-content: space-between;
    }

    .s-icon-arrows-arrow-right-24 {
      color: rgba(255, 255, 255, 0.3);
      margin: auto 15px;
      font-size: 30px;
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
