<template>
  <div class="main_app">
    <h1>{{ this.requestText }}</h1>
    <button @click="approveAuthReq">Yes, allow this application access</button>
    <button @click="approveAuthReq">Reject</button>
  </div>
</template>

<script>
import {
  subscribeAccounts,
  subscribeAuthorizeRequests,
  subscribeSigningRequests,
  subscribeMetadataRequests,
  approveAuthRequest,
} from '@/extension/messaging';

export default {
  name: 'Notification',
  data: function () {
    return {
      accounts: [],
      requests: [],
      signReq: [],
    };
  },
  mounted() {
    this.onMounted();
  },
  computed: {
    request: {
      get() {
        return this.requests;
      },
      set(data) {
        this.requests.push(...data);
      },
    },
    requestText() {
      if (this.requests.length)
        return `An application, self-identifying as ${this.requests[0][0].request.origin} is requesting access from ${this.requests[0][0].url}.`;
      else return 'await';
    },
  },
  methods: {
    setAccounts(data) {
      this.accounts = data;
    },
    setReq(data) {
      this.requests.push(data);
    },
    setSignReq(data) {
      this.accounts = data;
    },
    setMetaReq(data) {
      this.accounts = data;
    },
    onMounted() {
      Promise.all([
        subscribeAccounts(this.setAccounts),
        subscribeAuthorizeRequests(this.setReq),
        subscribeMetadataRequests(this.setMetaReq),
        subscribeSigningRequests(this.setSignReq),
      ]).then((res) => {
        console.info(res, this.$data);
      });
    },
    approveAuthReq() {
      approveAuthRequest(this.requests[0][0].id);
    },
  },
};
</script>

<style>
.main_app {
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
