<template>
  <div class="container">
    <Icon icon="sad-face" className="img" />
    <span class="subtext">{{ message }}</span>
  </div>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import Icon from '@/components/Icon.vue';

@Component({ components: { Icon } })
export default class NoWallets extends Vue {
  @Prop(String) message!: string;
}
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
