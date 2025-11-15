<template>
  <div class="advanced-button">
    <div class="button" data-testid="advancedSettingsBtn" @click="handleClick">
      {{ $t('addWallet.advancedSettings') }}

      <Icon icon="circle-plus" className="plus-icon" data-testid="plusIcon" />
    </div>
  </div>
</template>

<script lang="ts" setup>
const emit = defineEmits<{
  click: [];
}>();

const handleClick = () => emit('click');
</script>

<style lang="scss" scoped>
.advanced-button {
  color: $plain-white;
  margin-top: 5px;
  user-select: none;

  .button {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1em;
    line-height: 170%;
    opacity: 0.95;

    &:hover {
      cursor: pointer;
      opacity: 1;
    }

    .plus-icon {
      margin-left: 5px;
      width: 20px;
      height: 20px;
    }
  }

  i {
    color: white;
  }
}
</style>
