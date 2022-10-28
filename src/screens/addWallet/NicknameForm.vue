<template>
  <div class="nickname">
    <Input
      v-model="syncedNickname"
      placeholder="Wallet nickname"
      size="big"
      :maxlength="15"
      :readonly="readonly"
      class="input"
    />

    <Hint
      class="hint"
      iconName="notification"
      text="Example: Savings, Investments, Crowdloans, Staking. This nickname will be displayed only for you and stored
        locally."
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';
import Hint from '@/components/Hint.vue';
import Input from '@/components/Input.vue';

@Component({
  components: {
    Hint,
    Input,
  },
})
export default class NicknameForm extends Vue {
  @Prop({ default: false }) readonly!: boolean;
  @PropSync('nickname', { type: String }) syncedNickname!: string;
}
</script>

<style lang="scss" scoped>
.nickname {
  i {
    color: $plain-white;
  }

  .input {
    margin-bottom: 16px;
  }
}
</style>
