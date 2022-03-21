<template>
  <div class="nickname">
    <div>
      <s-input v-model="nickname" type="text" size="medium" placeholder="Wallet nickname" maxlength="25" />
    </div>
    <div class="info">
      <div>
        <s-icon name="info-16" />
      </div>
      <div class="info-text">
        Example: Savings, Investments, Crowdloans, Staking.This nickname will be displayed only for you and stored
        locally on your mobile device.
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Mutation, Getter } from 'vuex-class';
import { MutationTypes } from '../../store/account/mutations';
import { GettersTypes } from '../../store/account/getters';

@Component({})
export default class extends Vue {
  @Getter(GettersTypes.getNickname) getNickname!: string;
  @Mutation(MutationTypes.SET_NICKNAME) setNickname: any;

  input(nickname: string) {
    this.setNickname({ nickname });
  }

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
    color: #cccccc;
  }

  .info {
    margin-top: 10px;
    display: flex;
    font-size: 12px;
    text-align: left;

    .info-text {
      margin-left: 5px;
      color: #cccccc;
    }
  }
}
</style>
