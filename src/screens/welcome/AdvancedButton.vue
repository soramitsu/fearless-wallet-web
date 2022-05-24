<template>
  <div class="advanced-button">
    <div class="button" @click="$emit('click')">
      Advanced backup settings

      <img src="@/assets/circle-plus.svg" class="plus-icon" />
    </div>
  </div>
</template>

<style lang="scss"></style>

<style lang="scss" scoped>
.advanced-button {
  color: #ffffff;
  margin-top: 5px;

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
      color: yellow;
    }
  }

  i {
    color: white;
  }
}
</style>
