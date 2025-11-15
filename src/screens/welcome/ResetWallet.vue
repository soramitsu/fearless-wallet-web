<template>
  <AboveForm :fullScreen="true" header="welcome.resetWallet" @closeHandler="close">
    <Scroll>
      <div class="reset-content">
        <div>
          <Icon icon="info-triangle" className="img" />

          <div class="want-reset">{{ t('welcome.wantReset') }}</div>

          <div class="be-deleted">{{ t('welcome.walletWillBeDeleted') }}</div>

          <div class="enter-reset">{{ t('welcome.enterReset') }}</div>
        </div>

        <div>
          <FInput
            ref="passInput"
            size="big"
            :value="password"
            :placeholder="$t('welcome.resetWallet')"
            @change="changeOPassword"
          />

          <FButton
            class="pass"
            size="big"
            fontSize="big"
            width="100%"
            text="common.confirm"
            :disabled="isDisabled"
            @click="reset"
          />
        </div>
      </div>
    </Scroll>
  </AboveForm>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router';
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type ValidatedInput from '@/components/ValidatedInput.vue';
import { resetWallet } from '@/extension/messaging';
import { Components } from '@/router/routes';

const phrase = 'Reset wallet';
const router = useRouter();
const { t } = useI18n();

const password = ref('');
const passInput = ref<ValidatedInput>(null);

const isDisabled = computed(() => password.value !== phrase);

onMounted(() => passInput.value.input.focus());

const changeOPassword = async (pass: string) => (password.value = pass);
const close = () => router.back();

const reset = () => {
  resetWallet();

  router.push({ name: Components.Welcome });
};
</script>

<style lang="scss" scoped>
.pass {
  margin-top: 14px;
}

.reset-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  text-align: center;

  .want-reset {
    font-size: 20px;
    font-weight: 700;
  }

  .be-deleted {
    color: $gray-color;
    margin: 25px 0;
  }

  .enter-reset {
    font-weight: 700;
  }

  .img {
    margin-bottom: 30px;
    width: 85px;
    height: 85px;
  }
}
</style>
