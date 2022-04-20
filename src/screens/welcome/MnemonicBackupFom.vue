<template>
  <div class="mnemonic-backup-form">
    <div class="hint-container">
      <Hint
        iconType="warning"
        text="Use a non-digital way to backup. Write it down on paper (or etch it into metal) and make sure not to loose it."
      />
    </div>

    <MnemonicColumns :mnemonic="mnemonic" />

    <slot></slot>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import MnemonicColumns from './MnemonicColumns.vue';
import Hint from '../../components/Hint.vue';

@Component({
  components: { Hint, MnemonicColumns },
})
export default class extends Vue {
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
.mnemonic-backup-form {
  .hint-container {
    border-radius: var(--default-border-radius);
    width: 480px;
    height: 48px;
    padding: 8px 16px;
    background-color: rgba(255, 255, 255, 0.24);
    margin: 0 auto 10px;
  }
}
</style>
