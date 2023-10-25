<template>
  <ContentForm class="permissions">
    <h3 class="list__header">{{ $t('walletConnect.permissions.title') }}</h3>
    <div class="list">
      <div class="list__item">
        <Icon icon="check" className="icon" iconColor="success" />
        <span>{{ $t('walletConnect.permissions.viewAddress') }}</span>
      </div>
      <div class="list__item">
        <Icon icon="check" className="icon" iconColor="success" />
        <span>{{ $t('walletConnect.permissions.viewBalances') }}</span>
      </div>
      <div class="list__item">
        <Icon icon="close" className="icon" iconColor="error" />
        <span>{{ $t('walletConnect.permissions.transferAssets') }}</span>
      </div>
    </div>
  </ContentForm>
</template>
<script lang="ts" setup></script>

<style lang="scss">
.permissions {
  width: 100%;
}

.icon {
  width: 16px;
  height: 16px;
}

.list__header {
  text-align: left;
  padding: 16px 0 0 16px;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
  color: $default-white;
}

.list__item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 16px;
  font-size: 14px;
  font-weight: 400;
  line-height: 19px;
  color: $grayish-white;
}
</style>
