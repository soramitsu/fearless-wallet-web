<template>
  <AboveForm :fullScreen="true" header="staking.controllerAccount" :closeHandler="closeForm">
    <div class="controller-account">
      <div>
        <div class="controller-description row">{{ $t('staking.separateAccountController') }}</div>

        <Input v-model="accountName" size="big" placeholder="staking.stashAccount" :readonly="true" />

        <Hint text="staking.stashBond" iconName="notification" class="hint row" />

        <Input v-model="controllerAccount" size="big" placeholder="staking.controllerAccount" />

        <Hint text="staking.controllerUnbond" iconName="notification" class="hint row" />

        <Link text="staking.learnAboutControllers" class="about-controllers row" @click="openAboutControllers" />
      </div>

      <Button
        size="big"
        width="100%"
        text="common.confirm"
        :border="false"
        :disabled="disabledButton"
        @click="confirm"
      />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { NetworkName } from '@/interfaces';
import type { SelectedWallet } from '@/store';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import BaseApi from '@/util/BaseApi';

@Component
export default class ControllerAccount extends Vue {
  controllerAccount = '';

  @Prop({ type: String }) network!: NetworkName;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get accountName() {
    return this.selectedWallet.name;
  }

  get isValidControllerAddress() {
    if (this.controllerAccount === '') return false;

    return BaseApi.validateAddress(this.controllerAccount, this.network);
  }

  get disabledButton() {
    return !this.isValidControllerAddress;
  }

  closeForm() {
    this.$emit('closeForm');
  }

  confirm() {
    console.info('confirm');
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
  height: 100%;

  .hint {
    margin: 15px 0;
  }

  .row {
    margin-left: 15px;
  }

  .controller-description {
    font-size: 14px;
    text-align: left;
    color: $default-white;
    margin-bottom: 15px;
  }

  .about-controllers {
    margin-top: 10px;
  }
}
</style>
