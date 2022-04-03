<template>
  <div class="mnemonic-backup-form">
    <div class="header">Backup the passphrase for your new wallet</div>

    <HR />

    <div class="mnemonic-block">
      <div>
        <div v-for="(mnemonicElement, index) in mnemonicOne" :key="index" class="mnemonic-element">
          <div class="mnemonic-number">
            {{ index + 1 }}
          </div>
          <div class="mnemonic-text">
            {{ mnemonicElement }}
          </div>
        </div>
      </div>

      <div>
        <div v-for="(mnemonicElement, index) in mnemonicTwo" :key="index" class="mnemonic-element">
          <div class="mnemonic-number">
            {{ midpoint + index + 1 }}
          </div>
          <div class="mnemonic-text">
            {{ mnemonicElement }}
          </div>
        </div>
      </div>
    </div>

    <Hint
      iconType="notification"
      text="Use a non-digital way to backup the wallet passphrase (also known as the mnemonic, seed, or secret). You could
          write it down on paper (or etch it into metal) and store super duper hyper mega safely."
    />

    <slot></slot>

    <HR />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import HR from '../HR.vue';
import Hint from '../Hint.vue';

@Component({ components: { HR, Hint } })
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
  .header {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 12px;
  }

  .mnemonic-block {
    display: flex;
    justify-content: space-around;
    padding-bottom: 8px;
    font-size: 20px;

    .mnemonic-element {
      display: flex;

      .mnemonic-number {
        margin-right: 16px;
        color: #bb77ff;
        text-align: right;
        width: 25px;
      }

      .mnemonic-text {
        text-align: left;
        width: 150px;
      }
    }
  }
}
</style>
