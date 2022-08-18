<template>
  <AboveForm :blur="true" header="Authorize" :closeHandler="onClick">
    <div class="auth">
      <div>
        <p class="authorize-message">
          An application, self-identifying as
          <span class="authorize-message--name">polkadotjs/app</span> is requesting access from my
          <span class="authorize-message--link">http://url.com.</span>
        </p>
        <Alert />
      </div>
      <div class="buttons">
        <Button width="100%" text="Yes, allow this application access" size="big" fontSize="big" @click="onClick" />
        <Button width="100%" type="link" text="Reject" size="big" fontSize="medium" @click="onClick" />
      </div>
    </div>
  </AboveForm>
</template>

<script lang="ts">
import Vue from 'vue';
// import {
//   subscribeAccounts,
//   subscribeAuthorizeRequests,
//   subscribeSigningRequests,
//   subscribeMetadataRequests,
//   approveAuthRequest,
//   removeAuthorization,
// } from '@/extension/messaging';
import Button from '@/components/Button.vue';
import Hint from '@/components/Hint.vue';
import Alert from '@/screens/authorize/Alert.vue';
import AboveForm from '@/components/AboveForm.vue';

import Component from 'vue-class-component';
@Component({
  components: {
    Button,
    AboveForm,
    Alert,
    Hint,
  },
})
export default class Authorize extends Vue {
  onClick(event: Event) {
    console.log(event.target);
  }
}
</script>

<style lang="scss" scoped>
.warning {
  background: red;
}
.auth {
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  height: 90%;
}
.authorize-message {
  font-size: 16px;
  font-weight: 400px;
  margin-bottom: 20px;
}
.authorize-message--name {
  color: #bb77ff;
}
.authorize-message--link {
  color: #bb77ff;
  cursor: pointer;
}

.reject-button {
  color: #ffffffbf;
}
.buttons {
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  height: 90px;
}
</style>
