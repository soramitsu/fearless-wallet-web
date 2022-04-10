<template>
  <div class="nickname">
    <s-input
      v-model="_nickname"
      type="text"
      size="big"
      placeholder="Wallet nickname"
      maxlength="25"
      class="input"
      :readonly="readonly"
    />
    <Hint
      class="hint"
      iconType="notification"
      text="Example: Savings, Investments, Crowdloans, Staking. This nickname will be displayed only for you and stored
        locally."
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Hint from '../../components/Hint.vue';

@Component({ components: { Hint } })
export default class extends Vue {
  @Prop(String) nickname!: string;
  @Prop({ default: false }) readonly!: boolean;

  get _nickname(): string {
    return this.nickname;
  }

  set _nickname(value: string) {
    this.$emit('setValue', value, 'nickname');
  }
}
</script>

<style lang="scss" scoped>
.nickname {
  i {
    color: #ffffff;
  }

  .input {
    font-size: 24px;
    margin-bottom: 16px;
  }
}
</style>
