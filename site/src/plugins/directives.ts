import { defineNuxtPlugin } from '#app'
import onClickOutside from '~/directives/on-click-outside'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('on-click-outside', onClickOutside)
})
