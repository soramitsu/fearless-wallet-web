<template>
  <div class="mobile-sign__popup">
    <span>To sign with your mobile device, check if your mobile client is open and click "Sign"</span>

    <Button
      text="Sign"
      width="100%"
      size="medium"
      fontSize="big"
      type="primary"
      :border="false"
      @click="$emit('onSign')"
    />

    <Button
      text="Cancel"
      width="100%"
      size="medium"
      fontSize="big"
      type="secondary"
      :border="false"
      @click="$emit('onCancel')"
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
export default class SignMobile extends Vue {}
</script>

<style lang="scss" scoped>
.mobile-sign__popup {
  display: flex;
  flex-flow: column;
  gap: 10px;
}
</style>
