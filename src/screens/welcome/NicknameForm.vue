<template>
  <div class="nickname">
    <Input v-model="syncedNickname" placeholder="Wallet nickname" size="big" :maxlength="25" :readonly="readonly" />

    <Hint
      class="hint"
      iconType="notification"
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
export default class extends Vue {
  @Prop({ default: false }) readonly!: boolean;

  @PropSync('nickname', { type: String }) syncedNickname!: string;
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
