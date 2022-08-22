<template>
  <div class="main_app">
    <h1>Here is auth dApp</h1>
    <button @click="approveAuthReq">Approve</button>
  </div>
</template>

<script>
import {
  subscribeAccounts,
  subscribeAuthorizeRequests,
  subscribeSigningRequests,
  subscribeMetadataRequests,
  approveAuthRequest,
} from '../messaging';
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
        this.requests.push(data);
      },
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
      ]);
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
