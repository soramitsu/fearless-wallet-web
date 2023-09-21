<template>
  <div class="controller-account">
    <Hint text="staking.stashBond" iconName="notification" class="hint row" />

    <InputWithIcon
      v-model="addressCut"
      icon="close"
      placeholder="staking.controllerAccount"
      @click="setControllerAddress"
    />

    <div class="activity-buttons">
      <BadgeButton text="common.paste" @click="paste" />
    </div>

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
import { cut, getClipboard } from '@/helpers';

@Component
export default class ControllerAccount extends Vue {
  @Prop({ type: String }) network!: NetworkName;
  @PropSync('controllerAddress', { type: String }) syncedControllerAddress!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;

  get addressCut() {
    return cut(this.syncedControllerAddress);
  }

  get accountName() {
    return this.selectedWallet.name;
  }

  paste() {
    this.syncedControllerAddress = getClipboard();
  }

  setControllerAddress(value = '') {
    this.syncedControllerAddress = value;
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

  .activity-buttons {
    display: flex;
    user-select: none;
    margin-bottom: 15px;
  }
}
</style>
