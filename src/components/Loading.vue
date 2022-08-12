<template functional>
  <div class="loading">
    <div class="circle">
      <img src="@/assets/fw-pink-logo.svg" class="logo" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.loading {
  margin: auto;

  .circle {
    border-radius: 50%;
    width: 96px;
    height: 96px;
    border: 8px solid rgba(255, 255, 255, 0.1);
    display: inline-block;
  }

  .circle:after {
    content: ' ';
    top: 0;
    left: 0;
    display: block;
    margin: -71px -8px 0;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    border: 8px solid $pink-color;
    border-color: $pink-color transparent transparent;
    animation: arc 2s linear infinite;

    @keyframes arc {
      0% {
        transform: rotate(0deg);
      }
      100% {
        transform: rotate(360deg);
      }
    }
  }

  .logo {
    height: 39px;
    width: 70px;
    margin-top: 20px;
  }
}
</style>
