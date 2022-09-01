<template>
  <TransactionContent>
    <template slot="content">
      <WalletInfo
        class="wallet-info"
        :name="request.account.name"
        :address="request.account.address"
        network="Kusama"
      />

      <Corners size="big">
        <div class="transaction__info">
          <dl class="transaction__list">
            <TransactionInfo v-if="payload.blockHash" name="from" :value="request.url" />
            <TransactionInfo v-if="payload.blockHash" name="blockHash" :value="payload.blockHash" />
            <TransactionInfo v-if="payload.version" name="version" :value="payload.specVersion" />
            <TransactionInfo v-if="payload.method" name="method Data" :value="payload.method" />
            <TransactionInfo v-if="payload.era" name="lifetime" :value="payload.era" />
          </dl>
        </div>
      </Corners>

      <Input
        v-if="isLocked"
        ref="input"
        class="transaction__password"
        v-model="password"
        type="password"
        placeholder="Password for this account"
        :isError="isErrorPassword"
      />

      <div class="transaction__checkbox">
        <Checkbox v-model="isSavePass" size="medium" :label="prepLabel" />
      </div>
    </template>
    <template slot="control">
      <Button size="big" class="button" text="Sign the transaction" @click="onApprove" />

      <Button size="mini" type="link" text="Cancel" @click="onReject" />
    </template>
  </TransactionContent>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { SigningRequest } from '@polkadot/extension-base/background/types';
import { bnToBn, formatNumber } from '@polkadot/util';
import { isSignLocked } from '../../extension/messaging';
import type { SignerPayloadJSON } from '@polkadot/types/types';
import type { ExtrinsicEra } from '@polkadot/types/interfaces';
import BaseApi from '@/util/BaseApi';
import { SelectedWallet } from '@/store/accounts/types';
import Input from '@/components/Input.vue';
import Button from '@/components/Button.vue';
import Checkbox from '@/components/Checkbox.vue';
import WalletInfo from '@/screens/signing/WalletInfo.vue';
import TransactionContent from '@/layouts/TransactionContent.vue';
import Corners from '@/components/Corners.vue';
import TransactionInfo from '@/screens/signing/TransactionInfo.vue';
@Component({
  components: {
    WalletInfo,
    TransactionContent,
    TransactionInfo,
    Input,
    Button,
    Corners,
    Checkbox,
  },
})
export default class Auth extends Vue {
  @Getter('getSignRequestPayload') payload!: SignerPayloadJSON;
  @Getter('getSignRequest') request!: SigningRequest;
  @Getter('getSelectedWallet') selectedWallet!: SelectedWallet;
  isLocked = false;
  password = '';
  isErrorPassword = false;

  isSavePass = false;
  @Watch('isSavePass')
  update(value: boolean) {
    this.isSavePass = value;
  }

  async mounted() {
    const { isLocked } = await isSignLocked(this.request.id);
    console.log(this.request);
    this.isLocked = isLocked;
  }

  get prepLabel() {
    return this.isLocked
      ? 'Remember my password for the next 15 minutes'
      : 'Extend the period without password by 15 minutes';
  }
  mortalityAsString(era: ExtrinsicEra, hexBlockNumber: string): string {
    if (era.isImmortalEra) {
      return `immortal`;
    }

    // const blockNumber = bnToBn(hexBlockNumber);
    // const mortal = era.asMortalEra;
    // const birth = formatNumber(mortal.birth(blockNumber));
    // const death = formatNumber(mortal.death(blockNumber));

    return `mortal, valid from  to `;
  }
  get prepLifeTime() {
    return this.mortalityAsString(this.payload.era as unknown as ExtrinsicEra, this.payload.blockNumber);
  }
  onApprove() {
    try {
      if (!this.isSavePass) BaseApi.unlockPair(this.payload.address, this.password);
    } catch {
      this.isErrorPassword = true;

      return;
    }

    this.$store.dispatch('APPROVE_SIGN_PASSWORD', {
      id: this.request.id,
      isSavePass: this.isSavePass,
      password: this.password,
    });
  }

  onReject() {
    this.$store.dispatch('SIGN_CANCEL', this.request.id);
  }
}
</script>

<style lang="scss" scoped>
.wallet-info {
  margin-bottom: 14px;
}
.transaction__password {
  margin-bottom: 14px;
}
.transaction__checkbox {
  width: 100%;
  display: flex;
  align-items: flex-start;
}
.transaction__info {
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;
  width: 100%;
  display: flex;
  flex-flow: column;
  margin-bottom: 14px;
}
.transaction__list {
  display: grid;
  grid-template-columns: 100px 1fr;
  place-items: start;
  gap: 12px;
}
</style>
