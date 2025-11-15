<template>
  <div class="password-form">
    <ValidatedInput
      ref="pass1InputComponent"
      data-testid="enterPasswordInput"
      class="row"
      :value="pass1"
      :errorDescriptions="$t('addWallet.shortPassword')"
      :placeholder="$t('welcome.newPassword')"
      :isError="isShortPassword"
      :showPassword="true"
      @change="changePass1"
    />

    <ValidatedInput
      v-show="showPasswordConfirmation"
      data-testid="reEnterPasswordInput"
      class="row"
      :value="pass2"
      :errorDescriptions="$t('addWallet.notMatchPassword')"
      :placeholder="$t('welcome.reenterNewPassword')"
      :isError="isWrongPassword"
      :showPassword="true"
      @change="changePass2"
    />

    <Hint class="hint" iconName="notification" :text="hintText" data-testid="hintText" />

    <Hint v-if="isGoogleFlow" class="hint" iconName="notification" :text="hintGoogleDriveText" />
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ValidatedInput from '@/components/ValidatedInput.vue';

const props = withDefaults(
  defineProps<{
    isGoogleFlow?: boolean;
    showSamePasswordText: boolean;
    focus?: boolean;
  }>(),
  {
    isGoogleFlow: false,
    focus: true,
  }
);

const emit = defineEmits<{
  setPassword: [value: string];
}>();

const pass1 = ref('');
const pass2 = ref('');
const pass1InputComponent = ref<InstanceType<typeof ValidatedInput> | null>(null);

const { t } = useI18n();

const isShortPassword = computed(() => pass1.value.length !== 0 && pass1.value.length < 6);
const isWrongPassword = computed(() => Boolean(pass2.value.length) && pass1.value !== pass2.value);
const showPasswordConfirmation = computed(() => pass1.value.length !== 0 && !isShortPassword.value);

const hintGoogleDriveText = computed(() => t('addWallet.google.dataWillStoreOnGDrive'));
const hintText = computed(() =>
  props.showSamePasswordText ? t('addWallet.samePassword') : t('addWallet.passwordInfo')
);

const setPassword = (password: string) => {
  emit('setPassword', password);
};

const changePass1 = (value: string) => {
  pass1.value = value;
};

const changePass2 = (value: string) => {
  pass2.value = value;
};

watch(pass1, (value) => {
  if (value.length < 6) pass2.value = '';

  setPassword(value === pass2.value ? value : '');
});

watch(pass2, (value) => {
  setPassword(pass1.value === value ? value : '');
});

onMounted(() => {
  if (props.focus) pass1InputComponent.value?.input?.focus();
});
</script>

<style lang="scss" scoped>
.password-form {
  .row {
    margin-bottom: 14px;
  }

  .hint {
    margin-top: 10px;
  }
}
</style>
