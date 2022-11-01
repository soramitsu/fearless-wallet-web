<template>
  <div class="mobile-sign__popup">
    <span>{{ $t('mobileConnector.signMobile') }}</span>

    <Button
      text="Sign"
      width="100%"
      size="medium"
      fontSize="big"
      :disabled="isTransactionStarted"
      type="primary"
      :border="false"
      @click="handleSign"
    />

    <Button
      text="Cancel"
      width="100%"
      size="medium"
      fontSize="big"
      type="secondary"
      :border="false"
      @click="handleCancel"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Button from '@/components/Button.vue';
import Popup from '@/components/Popup.vue';

@Component({
  components: {
    Button,
    Popup,
  },
})
export default class SignMobile extends Vue {
  isTransactionStarted = false;
  handleSign() {
    this.isTransactionStarted = true;
    this.$emit('onSign');
  }
  handleCancel() {
    this.$emit('onCancel');
  }
}
</script>

<style lang="scss" scoped>
.mobile-sign__popup {
  display: flex;
  flex-flow: column;
  gap: 10px;
}
</style>
