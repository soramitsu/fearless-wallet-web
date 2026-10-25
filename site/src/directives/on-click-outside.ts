import { type DirectiveBinding } from 'vue'

interface ClickOutsideElement extends HTMLElement {
  vueClickOutside?: (event: MouseEvent) => void
}

const clickOutside = {
  beforeMount(el: ClickOutsideElement, binding: DirectiveBinding) {
    el.vueClickOutside = (event: MouseEvent) => {
      if (!(el === event.target || el.contains(event.target as Node))) {
        binding.value(event)
      }
    }

    document.addEventListener('click', el.vueClickOutside)
  },
  unmounted(el: ClickOutsideElement) {
    if (el.vueClickOutside) {
      document.removeEventListener('click', el.vueClickOutside)
      delete el.vueClickOutside
    }
  },
}

export default clickOutside
