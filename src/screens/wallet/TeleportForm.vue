<template>
  <ActivityForm header="Teleport" buttonText="Send" :handlerButton="send" :closeForm="closeForm" class="teleport-form">
    <div class="teleport-form-content">
      <Select v-model="walletAddress" :options="optionsWallets" placeholder="Send from" size="big" class="row" />

      <div class="row select-networks">
        <Select v-model="originNetwork" :options="optionsNetwork" placeholder="Origin network" size="big" />

        <s-icon name="arrows-arrow-right-24" />

        <Select v-model="destinationNetwork" :options="optionsNetwork" placeholder="Destination network" size="big" />
      </div>

      <Input v-model="amount" placeholder="Amount to send" size="big" class="row" />
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
import Select from '@/components/Select.vue';
import Input from '@/components/Input.vue';
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
