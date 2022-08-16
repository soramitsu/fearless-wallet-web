<template>
  <AboveForm :blur="true" header="Authorize">
    <div class="auth">
      <div>
        <p>An application, self-identifying as polkadotjs/apps is requesting access from my http://url.com.</p>
        <Hint
          iconName="warning"
          class="warning"
          text="Only approve this request if you trust the application. Approving gives the application access to the addresses of you accounts"
        >
        </Hint>
      </div>
      <div class="buttons">
        <Button
          width="100%"
          text="Yes, allow this application access"
          size="big"
          fontSize="big"
          @click="approveAuthReq"
        />
        <a class="reject-button">Cancel</a>
      </div>
    </div>
  </AboveForm>
</template>

<script>
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

import AboveForm from '@/components/AboveForm.vue';

import Component from 'vue-class-component';
@Component({
  components: {
    Button,
    AboveForm,
    Hint,
  },
})
export default class Authorize extends Vue {
  // components: {
  //   Button,
  // },
  // data: function () {
  //   return {
  //     requests: [],
  //   };
  // },
  // mounted() {
  //   this.onMounted();
  // },
  // computed: {
  //   request: {
  //     get() {
  //       return this.requests;
  //     },
  //     set(data) {
  //       this.requests.push(...data);
  //     },
  //   },
  //   requestText() {
  //     if (this.requests.length)
  //       return `An application, self-identifying as ${this.requests[0][0].request.origin} is requesting access from ${this.requests[0][0].url}.`;
  //     else return 'await';
  //   },
  // },
  // methods: {
  //   setReq(data) {
  //     this.requests.push(data);
  //   },
  //   onMounted() {
  //     Promise.all([
  //       subscribeAccounts(this.setAccounts),
  //       subscribeAuthorizeRequests(this.setReq),
  //       subscribeMetadataRequests(this.setMetaReq),
  //       subscribeSigningRequests(this.setSignReq),
  //     ]).then((res) =
  //       console.log(res, this.$data);
  //     });
  //   },
  //   approveAuthReq() {
  //     approveAuthRequest(this.requests[0][0].id, this.accounts);
  //   },
  //   rejectAuthReq() {
  //     removeAuthorization(this.requests[0][0].id);
  //   },
  // },
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
