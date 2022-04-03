<template>
  <div class="nickname">
    <s-input v-model="nickname" type="text" size="big" placeholder="Wallet nickname" maxlength="25" class="input" />
    <Hint
      iconType="notification"
      text="Example: Savings, Investments, Crowdloans, Staking. This nickname will be displayed only for you and stored
        locally."
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Mutation, Getter } from 'vuex-class';
import { MutationTypes } from '../../store/accounts/mutations';
import { GettersTypes } from '../../store/accounts/getters';
import Hint from '../Hint.vue';

@Component({ components: { Hint } })
export default class extends Vue {
  @Getter(GettersTypes.getNickname) getNickname!: string;
  @Mutation(MutationTypes.SET_NICKNAME) setNickname: any;

  get nickname(): string {
    return this.getNickname;
  }

  set nickname(nickname: string) {
    this.setNickname({ nickname });
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
  }
}
</style>
