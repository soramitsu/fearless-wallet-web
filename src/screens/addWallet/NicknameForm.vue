<template>
  <div class="nickname">
    <FInput
      :value="syncedNickname"
      ref="nicknameInputComponent"
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

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import FInput from '@/components/FInput.vue';

const props = withDefaults(
  defineProps<{
    readonly?: boolean;
    nickname: string;
  }>(),
  {
    readonly: false,
  }
);

const emit = defineEmits<{
  'update:nickname': [value: string];
}>();

const nicknameInputComponent = ref<InstanceType<typeof FInput> | null>(null);

const syncedNickname = computed({
  get: () => props.nickname,
  set: (value: string) => emit('update:nickname', value),
});

const changeSyncedNickname = (value: string) => {
  syncedNickname.value = value;
};

onMounted(() => {
  nicknameInputComponent.value?.input?.focus();
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
