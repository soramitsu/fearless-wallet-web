<template>
  <div class="container">
    <Icon icon="sad-face" className="img" />
    <span class="subtext">No saved wallets were found on the Google Drive</span>
  </div>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import Icon from '@/components/Icon.vue';

@Component({
  components: { Icon },
})
export default class NoWallets extends Vue {}
</script>

<style lang="scss" scoped>
.container {
  display: flex;
  flex-flow: column;
  align-items: center;
  place-content: center;
  gap: 35px;
}

.subtext {
  font-size: 18px;
  color: #ffffffbf;
}

.img {
  width: 91px;
  height: 91px;
}
</style>
