<template>
  <div class="wallet-ecosystem">
    <ContentForm :isStaticHeight="true" :bottomRightCorner="true">
      <div class="content-form-ecosystem">
        <div>{{ $t('welcome.ecosystemEvmSubstrate') }}</div>

        <FButton
          width="140px"
          size="small"
          fontSize="small"
          type="secondary"
          text="welcome.joinEvmSubstrate"
          class="ecosystem-button"
          :border="false"
          data-testid="substrateEcosystem"
          @click="setEcosystem('substrate')"
        />

        <Icon icon="ethereum-ecosystem" class="ecosystem-img ethereum-img" />

        <Icon icon="substrate-ecosystem" class="ecosystem-img substrate-img" />
      </div>
    </ContentForm>

    <ContentForm :isStaticHeight="true" :bottomRightCorner="true">
      <div class="content-form-ecosystem">
        <div>{{ $t('welcome.ecosystemTon') }}</div>

        <Icon icon="ton-ecosystem" class="ecosystem-img ton-img" />

        <FButton
          width="80px"
          size="small"
          fontSize="small"
          type="secondary"
          text="welcome.joinTon"
          class="ecosystem-button"
          :border="false"
          data-testid="substrateEcosystem"
          @click="setEcosystem('ton')"
        />
      </div>
    </ContentForm>
  </div>
</template>

<script lang="ts" setup>
import { type WalletEcosystem } from '@/interfaces';

const emit = defineEmits(['setEcosystem']);

const setEcosystem = (ecosystem: WalletEcosystem) => emit('setEcosystem', ecosystem);
</script>

<style lang="scss" scoped>
.wallet-ecosystem {
  display: flex;
  gap: 10px;
}

.button--content-wrap {
  flex: 1 1 100px;
}

.content-form-ecosystem {
  display: flex;
  flex-direction: column;
  text-align: left;
  height: 109px;
  width: 260px;
  padding: 16px 22px 16px 14px;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 700;
  user-select: none;
}

.ecosystem-img {
  position: absolute;
  height: 45px;
  width: 45px;
}

.ethereum-img {
  top: 34px;
  right: 5px;
}

.substrate-img {
  top: 63px;
  right: 40px;
}

.ton-img {
  top: 48px;
  right: 20px;
}
</style>
