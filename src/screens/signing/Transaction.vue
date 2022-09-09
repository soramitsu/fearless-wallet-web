<template>
  <TransactionContent>
    <template slot="content">
      <WalletInfo class="wallet-info" :name="request.account.name" :address="request.account.address" />

      <InfoList>
        <InfoItem name="from" :value="request.url" />
        <InfoItem name="genesis" :value="typedPayload.genesisHash" />
        <InfoItem name="version" :value="typedPayload.specVersion" />
        <InfoItem name="nounce" :value="typedPayload.nonce" />
        <InfoItem name="method Data" :value="typedPayload.method" />
        <InfoItem name="lifetime" :value="morality" />
      </InfoList>

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
import type { SignerPayloadJSON } from '@polkadot/types/types';
import type { ExtrinsicEra } from '@polkadot/types/interfaces';
import { registry } from '@/util/registry';
import { isSignLocked } from '@/extension/messaging';
import BaseApi from '@/util/BaseApi';
import Input from '@/components/Input.vue';
import Button from '@/components/Button.vue';
import Checkbox from '@/components/Checkbox.vue';
import WalletInfo from '@/screens/signing/WalletInfo.vue';
import TransactionContent from '@/layouts/TransactionContent.vue';
import InfoList from '@/layouts/InfoList.vue';
import InfoItem from '@/screens/signing/InfoItem.vue';

@Component({
  components: {
    WalletInfo,
    TransactionContent,
    InfoItem,
    InfoList,
    Input,
    Button,
    Checkbox,
  },
})
export default class Auth extends Vue {
  @Getter('getSignRequestPayload') payload!: SignerPayloadJSON;
  @Getter('getSignRequest') request!: SigningRequest;
  isLocked = false;
  password = '';
  isErrorPassword = false;

  isSavePass = false;
  updateSave = true;

  @Watch('isSavePass')
  update(value: boolean) {
    this.isSavePass = value;
  }

  get typedPayload() {
    return registry.createType('ExtrinsicPayload', this.payload, { version: this.payload.version });
  }

  async mounted() {
    const { isLocked } = await isSignLocked(this.request.id);

    this.isLocked = isLocked;
    this.isSavePass = this.isLocked ? false : true;
  }

  get prepLabel() {
    return this.isLocked
      ? 'Remember my password for the next 15 minutes'
      : 'Extend the period without password by 15 minutes';
  }

  get morality() {
    return this.mortalityAsString(this.typedPayload.era, this.payload.blockNumber);
  }

  mortalityAsString(era: ExtrinsicEra, hexBlockNumber: string) {
    if (era.isImmortalEra) return 'immortal';

    const { birth, death } = BaseApi.mortalityDecode(era, hexBlockNumber);

    return `mortal, valid from ${birth} to ${death}`;
  }

  onApprove() {
    try {
      if (this.isLocked) BaseApi.unlockPair(this.payload.address, this.password);
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
</style>
