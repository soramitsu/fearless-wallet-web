<template>
  <div class="container">
    <div class="header">
      <img class="header__logo" src="@/assets/wallet-logo.svg" />
      <span>Transaction</span>
    </div>
    <div>
      <slot name="content"></slot>
    </div>
    <div>
      <slot name="control"></slot>
    </div>
  </div>
</template>

<script lang="ts">
export default {};
</script>

<style lang="scss" scoped>
.container {
  display: grid;
  grid-template-rows: 50px 370px 100px;
  align-items: end;
  gap: 24px;
  height: 100%;
}
.header {
  display: flex;
  flex-flow: row;
  align-items: center;
  font-size: 24px;
  height: 50px;
}
.header > .header__logo {
  padding-right: 20px;
}
</style>
