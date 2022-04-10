<template>
  <Popup :handlerClose="handlerClose">
    <s-icon name="notifications-alert-triangle-24" />
    <div class="text">{{ text }}</div>
    <div class="subtext">{{ subtext }}</div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Popup from './Popup.vue';

interface Headers {
  text: string;
  subtext: string;
}

@Component({
  components: {
    Popup,
  },
})
export default class extends Vue {
  @Prop(Object) headers!: Headers;
  @Prop(Function) handlerClose!: () => void;

  get text() {
    return this.headers?.text ?? '';
  }

  get subtext() {
    return this.headers?.subtext ?? '';
  }
}
</script>

<style lang="scss" scoped>
.text {
  font-weight: 700;
  font-size: 18px;
  line-height: 150%;
  margin: 20px 0 4px;
}

.subtext {
  color: rgba(255, 255, 255, 0.5);
  width: 255px;
  line-height: 150%;
}

.s-icon-notifications-alert-triangle-24 {
  width: 42px;
  height: 42px;
  font-size: 42px !important;
  color: #ee7700;
}
</style>
