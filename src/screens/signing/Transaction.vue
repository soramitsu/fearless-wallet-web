<template>
  <TransactionLayout>
    <template slot="content">
      <WalletInfo />
      <Input v-model="value" type="password" placeholder="Password for this account" />
      <Checkbox label="Remember my password for the next 15 minutes" />
    </template>
    <template slot="control">
      <Button size="big" class="button" text="Sign the transaction" />
      <Button size="mini" type="link" text="Cancel" />
    </template>
  </TransactionLayout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Input from '@/components/Input.vue';
import Button from '@/components/Button.vue';
import Checkbox from '@/components/Checkbox.vue';
import type { ExtrinsicEra } from '@polkadot/types/interfaces';
import { bnToBn, formatNumber } from '@polkadot/util';
import WalletInfo from '@/screens/signing/WalletInfo.vue';
import TransactionLayout from '@/screens/signing/TransactionLayout.vue';

@Component({
  components: {
    WalletInfo,
    TransactionLayout,
    Input,
    Button,
    Checkbox,
  },
})
export default class Auth extends Vue {
  value = '';

  mortalityAsString(era: ExtrinsicEra, hexBlockNumber: string): string {
    if (era.isImmortalEra) return 'immortal';

    const blockNumber = bnToBn(hexBlockNumber);
    const mortal = era.asMortalEra;
    const birth = formatNumber(mortal.birth(blockNumber));
    const death = formatNumber(mortal.death(blockNumber));

    return `mortal, valid from ${birth} to ${death}`;
  }

  onChangeState(event: Event) {
    console.info(event);
  }
}
</script>

<style lang="scss" scoped></style>
