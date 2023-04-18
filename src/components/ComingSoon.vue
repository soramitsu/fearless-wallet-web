<template>
  <div class="coming-soon">
    <Icon :icon="getImg" className="img" />

    <div class="name">{{ $t(`menu.${name.toLowerCase()}`) }} {{ $t('common.comingSoon') }}</div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class ComingSoon extends Vue {
  @Prop(String) name!: string;

  get getImg() {
    return this.name.toLowerCase();
  }
}
</script>

<style lang="scss" scoped>
.coming-soon {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;

  .name {
    margin-top: 25px;
    color: rgba(255, 255, 255, 0.3);
  }

  .img {
    height: 100px;
    width: 100px;
    opacity: 50%;
  }
}
</style>
