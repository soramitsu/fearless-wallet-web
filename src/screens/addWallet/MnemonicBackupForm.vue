<template>
  <div class="mnemonic-backup-form">
    <Hint
      class="seed-hint"
      iconName="warning"
      text="Use a non-digital way to backup. Write it down on paper (or etch it into metal) and make sure not to loose it."
    />

    <MnemonicColumns :mnemonic="mnemonic" />

    <slot></slot>
  </div>
</template>

<script lang="ts">
import MnemonicColumns from './MnemonicColumns.vue';
import Hint from '@/components/Hint.vue';
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({
  components: { Hint, MnemonicColumns },
})
export default class MnemonicBackupForm extends Vue {
  @Prop(String) mnemonic!: string;

  get mnemonicArray() {
    return this.mnemonic.split(' ');
  }

  get mnemonicLength() {
    return this.mnemonicArray.length;
  }

  get midpoint() {
    return Math.ceil(this.mnemonicLength / 2);
  }

  get mnemonicOne() {
    return this.mnemonicArray.slice(0, this.midpoint);
  }

  get mnemonicTwo() {
    return this.mnemonicArray.slice(this.midpoint, this.mnemonicLength);
  }
}
</script>

<style lang="scss" scoped>
.seed-hint {
  border-radius: $default-border-radius;
  width: 480px;
  height: 48px;
  padding: 8px 16px;
  background-color: rgba(255, 255, 255, 0.24);
  margin: 0 auto;
}
</style>
