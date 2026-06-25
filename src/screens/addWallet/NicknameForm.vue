<template>
  <div class="nickname">
    <FInput
      :value="syncedNickname"
      ref="nicknameInput"
      placeholder="addWallet.walletNickname"
      size="big"
      :maxlength="35"
      :readonly="readonly"
      data-testid="nicknameInput"
      class="input"
      @change="changeSyncedNickname"
    />

    <Hint class="hint" iconName="notification" text="addWallet.exampleNameWallet" data-testid="exampleText" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';


export default defineComponent({ name: 'NicknameForm' ,
  props: {
    readonly: { default: false },
    nickname: { type: String },
  },
  computed: {
    syncedNickname: {
      get() {
        return this.nickname;
      },
      set(value) {
        this.$emit('update:nickname', value);
      },
    },
    nicknameInputComponent() {
      return this.$refs.nicknameInput;
    },
  },
  mounted() {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        this.nicknameInputComponent.input.focus();
  },
  methods: {
    changeSyncedNickname(value: string) {
      this.syncedNickname = value;
    },
  },
});
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
