<template>
  <div class="controller-account">
    <Hint text="staking.stashBond" iconName="notification" class="hint row" />

    <FInput v-model="syncedControllerAccount" size="big" placeholder="staking.controllerAccount" />

    <Hint text="staking.controllerUnbond" iconName="notification" class="hint row" />

    <FLink text="staking.learnAboutControllers" class="about-controllers row" @click="openAboutControllers" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { NetworkName } from '@/interfaces';
import type { SelectedWallet } from '@/store';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

@Component
export default class ControllerAccount extends Vue {
  @Prop({ type: String }) network!: NetworkName;
  @PropSync('controllerAccount', { type: String }) syncedControllerAccount!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;

  get accountName() {
    return this.selectedWallet.name;
  }

  openAboutControllers() {
    console.info('openAboutControllers');
  }
}
</script>

<style lang="scss" scoped>
.controller-account {
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  .hint {
    margin: 15px 0;
  }

  .row {
    margin-left: 15px;
  }

  .about-controllers {
    margin-top: 10px;
  }
}
</style>
