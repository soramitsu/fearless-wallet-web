<template>
  <div class="mobile-sign__popup">
    <span>{{ $t('mobileConnector.signMobile') }}</span>

    <FButton text="common.sign" width="100%" size="medium" fontSize="big" type="primary" :border="false" @click="handleSign" />

    <FButton
      text="common.cancel"
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
import { defineComponent } from 'vue';

export default defineComponent({ name: 'SignMobile' ,
  methods: {
    handleSign() {
      this.$emit('onSign');
    },
    handleCancel() {
      this.$emit('onCancel');
    },
  },
});
</script>

<style lang="scss" scoped>
.mobile-sign__popup {
  display: flex;
  flex-flow: column;
  gap: 10px;
}
</style>
