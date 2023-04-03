<template>
  <Popup headerText="soraCard.completeKYC" sizeWidth="big" :showBorder="true" :handlerClose="handlerClose">
    <div class="steps">
      <div class="row">
        <Icon icon="email" class="icon" />

        <div class="step">
          <div class="description">
            <div>{{ $t('soraCard.verifyContactInfo') }}</div>
            <div class="subtext">{{ $t('soraCard.emailPhone') }}</div>
          </div>

          <div :class="getCircleClasses(1)">
            <div v-if="getInnerCircleVisibility(1)" class="inner-circle"></div>
          </div>
        </div>
      </div>

      <div class="row">
        <Icon icon="document-text" class="icon" />

        <div class="step">
          <div class="description">
            <div>{{ $t('soraCard.verifyDocuments') }}</div>
            <div class="subtext">{{ $t('soraCard.selfieDocument') }}</div>
          </div>

          <div :class="getCircleClasses(2)">
            <div v-if="getInnerCircleVisibility(2)" class="inner-circle"></div>
          </div>
        </div>
      </div>

      <div class="row">
        <Icon icon="person-user" class="icon" />

        <div class="step">
          <div class="description">
            <div>{{ $t('soraCard.submitPersonalData') }}</div>
            <div class="subtext">{{ $t('soraCard.nameAddress') }}</div>
          </div>

          <div :class="getCircleClasses(3)">
            <div v-if="getInnerCircleVisibility(3)" class="inner-circle"></div>
          </div>
        </div>
      </div>

      <Button width="100%" text="common.start" class="proceed-button" @click="proceed" />

      <BorderButton width="100%" text="common.cancel" @click="handlerClose" />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class StepsKYCPopup extends Vue {
  @Prop(Function) handlerClose!: VoidFunction;
  @Prop(Function) proceed!: VoidFunction;
  @Prop(Array) fillSteps!: number[];

  getCircleClasses(step: number) {
    return [
      'circle',
      {
        'fill-circle': this.getInnerCircleVisibility(step),
      },
    ];
  }

  getInnerCircleVisibility(step: number) {
    return this.fillSteps.includes(step);
  }
}
</script>

<style scoped lang="scss">
.steps {
  padding: 16px;

  .row {
    display: flex;
    align-items: center;
    padding: 10px;
    border-top: 1px solid $default-background-color;
    color: $default-white;

    &:first-child {
      border-top: none;
    }
  }

  .step {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;

    .description {
      display: flex;
      flex-direction: column;
      align-items: flex-start;

      .subtext {
        color: $gray-color;
      }
    }

    .fill-circle {
      border: 1px solid #7700ee;
    }

    .circle {
      background-color: $default-background-color;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;

      .inner-circle {
        background-color: #7700ee;
        width: 16px;
        height: 16px;
        border-radius: 50%;
      }
    }
  }

  .icon {
    width: 15px;
    height: 15px;
    margin-right: 10px;
    min-width: 15px;
  }

  .proceed-button {
    margin: 20px 0 10px;
  }
}
</style>
