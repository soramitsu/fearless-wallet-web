<template>
  <div class="advanced-button">
    <div class="button" @click="$emit('click')">
      Advanced backup settings

      <Icon icon="circle-plus" className="plus-icon" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.advanced-button {
  color: $plain-white;
  margin-top: 5px;
  user-select: none;

  .button {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
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
