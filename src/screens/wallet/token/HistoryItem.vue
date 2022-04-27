<template>
  <div class="history-item">
    <Logo size="mini" typeLogo="secondary" />

    <div class="column">
      <div class="first-row">
        <div>{{ formattedId }}</div>
        <div>{{ value }} {{ token }}</div>
      </div>
      <div class="second-row">
        <div>{{ typeFormatted }}</div>
        <div>{{ time }}</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { firstCharToUp } from '@/util/stringHelper';
import Logo from '@/components/Logo.vue';

@Component({
  components: {
    Logo,
  },
})
export default class extends Vue {
  @Prop(String) id!: string;
  @Prop(String) type!: string;
  @Prop(String) token!: string;
  @Prop(Number) value!: number;
  @Prop(Number) time!: number;

  get date() {
    return new Date(this.time);
  }

  get formattedId() {
    return `${this.id.slice(0, 7)}...${this.id.slice(-8)}`;
  }

  get typeFormatted() {
    return firstCharToUp(this.type);
  }
}
</script>

<style lang="scss" scoped>
.history-item {
  display: flex;
  margin: 11px 16px 0 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);

  .column {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    width: 100%;
    margin-left: 13px;

    .first-row {
      display: flex;
      justify-content: space-between;
      font-weight: 600;
    }

    .second-row {
      display: flex;
      justify-content: space-between;
      color: rgba(255, 255, 255, 0.64);
      font-size: 14px;
    }
  }
}
</style>
