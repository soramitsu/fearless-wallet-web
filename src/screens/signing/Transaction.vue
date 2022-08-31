<template>
  <TransactionContent>
    <template slot="content">
      <WalletInfo class="wallet-info" :name="selectedWallet.name" :address="payload.address" network="Kusama" />

      <Corners size="big">
        <div class="transaction__info">
          <dl class="transaction__list">
            <TransactionInfo name="blockHash" :value="payload.blockHash" />
            <TransactionInfo name="version" :value="payload.version" />
            <TransactionInfo name="method Data" :value="payload.method" />
            <TransactionInfo name="lifetime" :value="payload.era" />
          </dl>
        </div>
      </Corners>

      <Input class="transaction__password" v-model="value" type="password" placeholder="Password for this account" />

      <div class="transaction__checkbox">
        <Checkbox size="medium" label="Remember my password for the next 15 minutes" />
      </div>
    </template>
    <template slot="control">
      <Button size="big" class="button" text="Sign the transaction" @click="onApprove" />

      <Button size="mini" type="link" text="Cancel" @click="onReject" />
    </template>
  </TransactionContent>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { SigningRequest } from '@polkadot/extension-base/background/types';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
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
  value = '';
  @Getter('getSignRequestPayload') payload!: SignerPayloadJSON | SignerPayloadRaw;
  @Getter('getSignRequest') request!: SigningRequest;

  @Getter('getSelectedWallet') selectedWallet!: SelectedWallet;

  get preparedRequest() {
    return this.request;
  }

  onApprove() {
    this.$store.dispatch('APPROVE_SIGN_PASSWORD', this.request.id);
  }

  onReject() {
    this.$store.dispatch('SIGN_CANCEL', this.request.id);
  }

  onChangeState(event: Event) {
    console.info(event);
  }
}
</script>

<style lang="scss" scoped>
.wallet-info {
  margin-bottom: 16px;
}
.transaction__password {
  margin-bottom: 24px;
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
