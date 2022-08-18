<template>
  <div>
    <TransactionHeader />
    <Input v-model="value" type="password" placeholder="Password for this account"></Input>
    <Checkbox label="Remember my password for the next 15 minutes"></Checkbox>
    <Button size="big" class="button" text="Sign the transaction" />
    <Button size="mini" type="link" text="Cancel" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Container from '@/screens/signing/Container.vue';
import Input from '@/components/Input.vue';
import Button from '@/components/Button.vue';
import Checkbox from '@/components/Checkbox.vue';
import type { ExtrinsicEra } from '@polkadot/types/interfaces';
import { bnToBn, formatNumber } from '@polkadot/util';
import TransactionHeader from '@/screens/signing/TransactionHeader.vue';
// import { westendMetadata } from '@/mocks/metaData';

@Component({
  components: {
    Container,
    TransactionHeader,
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
    console.log(event);
  }
}
</script>

<style lang="scss" scoped>
.transaction-container {
  border-radius: 0 0 $default-border-radius $default-border-radius;
}
</style>
