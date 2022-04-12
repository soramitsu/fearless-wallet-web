import Vue from 'vue';
import VueRouter from 'vue-router';
import routes from './routes';
import { Route } from '../../node_modules/vue-router/types/router';

// const originalPush = VueRouter.prototype.push;

// VueRouter.prototype.push = function (location) {
//   return (originalPush.call(this, location) as unknown as Promise<Route>).catch((error) => {
//     if (error.name !== 'NavigationDuplicated') {
//       return error;
//     }
//   });
// };

Vue.use(VueRouter);

const router = new VueRouter({
  mode: 'hash',
  base: process.env.BASE_URL,
  routes,
});

export default router;
