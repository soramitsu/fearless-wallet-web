<template>
  <Popup
    :showHeader="false"
    :showBlur="false"
    :showBorder="true"
    :top="50"
    :handlerClose="handlerClose"
    sizeWidth="big"
    verticalPlacement="top"
    horizontalPlacement="right"
  >
    <div class="settings">
      <div class="row" @click="open('Accounts')">
        <div class="description">
          <img src="@/assets/account.svg" class="icon" />

          <div class="label">Accounts</div>
        </div>

        <img src="@/assets/chevron-right.svg" class="chevron-right" />
      </div>
      <div class="row" @click="openFiatsPopup">
        <div class="description">
          <img src="@/assets/dollar-circle.svg" class="icon" />

          <div class="label">Currency</div>
        </div>

        <img src="@/assets/chevron-right.svg" class="chevron-right" />
      </div>
      <div class="row">
        <div class="description">
          <img src="@/assets/language.svg" class="icon" />

          <div class="label">Language</div>
        </div>

        <img src="@/assets/chevron-right.svg" class="chevron-right" />
      </div>
      <div class="row">
        <div class="description">
          <img src="@/assets/info.svg" class="icon" />

          <div class="label">About</div>
        </div>

        <img src="@/assets/chevron-right.svg" class="chevron-right" />
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import Popup from '@/components/Popup.vue';
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Components } from '@/router/routes';

type SettingsItemType = 'Accounts';

@Component({
  components: { Popup },
})
export default class SettingsPopup extends Vue {
  @Prop(Function) handlerClose!: VoidFunction;

  get routeName() {
    return this.$route.name;
  }

  openFiatsPopup() {
    this.$emit('openFiatsPopup');
  }

  open(name: SettingsItemType) {
    if (this.routeName !== name) {
      this.$router.push({ name: Components[name] });
    }

    this.handlerClose();
  }
}
</script>

<style lang="scss" scoped>
.settings {
  color: rgba(255, 255, 255, 0.75);
  font-weight: 700;
  user-select: none;

  .row {
    display: flex;
    justify-content: space-between;
    margin: 0 20px 28px 20px;

    &:last-child {
      margin-bottom: 0;
    }

    &:hover {
      cursor: pointer;
      color: rgba(255, 255, 255, 0.9);

      .icon {
        filter: invert(0.1);
      }

      .chevron-right {
        filter: invert(0.25);
      }
    }

    .icon {
      filter: invert(0.25);
    }

    .chevron-right {
      filter: invert(0.5);
    }

    .description {
      display: flex;
    }

    .label {
      margin: auto 0 auto 10px;
      width: 160px;
      text-align: left;
    }
  }
}
</style>
