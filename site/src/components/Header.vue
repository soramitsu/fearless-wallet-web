<script setup lang="ts">
const open = ref(false)

const router = useRouter()
router.afterEach(() => open.value = false)

const menu = [
  {
    title: 'Roadmap',
    href: '/roadmap'
  },
  {
    title: 'FAQ',
    href: '/faq'
  },
  {
    title: 'Blog',
    href: '/blog',
  },
  {
    title: 'wiki',
    href: 'https://wiki.fearlesswallet.io/',
    external: true
  }
];
</script>

<template>
  <header class="header pt-xs pb-l" v-on-click-outside="() => { open = false }">
    <div class="w px-xs inner text-xxs">
      <NuxtLink to="/" class="home text-xxs" active-class="active">
        <img src="/logo.svg" alt="Fearless Wallet logo" width="74" height="32">
        <span class="nav-item">Fearless wallet</span>
      </NuxtLink>
      <nav class="nav" :class="{ open }">
        <div class="main-nav">
          <NuxtLink v-for="(item, index) in menu" :key="index" :to="item.href" :target="item.external ? '_blank' : undefined" class="nav-item"
            active-class="active">
            {{ item.title }}
            <svg v-if="item.external" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fill-rule="evenodd" clip-rule="evenodd"
                d="M6.66667 5.77778C6.66667 4.79594 7.4626 4 8.44444 4H18.2222C19.2041 4 20 4.79594 20 5.77778V15.5556C20 16.5374 19.2041 17.3333 18.2222 17.3333C17.2404 17.3333 16.4444 16.5374 16.4444 15.5556V10.0697L7.03486 19.4793C6.34059 20.1736 5.21496 20.1736 4.5207 19.4793C3.82643 18.785 3.82643 17.6594 4.5207 16.9651L13.9303 7.55556H8.44444C7.4626 7.55556 6.66667 6.75962 6.66667 5.77778Z"
                fill="currentColor" />
            </svg>

          </NuxtLink>
        </div>
        <NuxtLink to="/community" class="nav-item" active-class="active">Community</NuxtLink>
        <Button href="/download" title="Download" icon="download" small accent class="download" />
      </nav>
      <button class="burger" :class="{ open }" @click="open = !open">Menu</button>
    </div>
  </header>
</template>

<style scoped>
.header {
  position: fixed;
  top: 0;
  width: 100%;
  z-index: 10;
  background: linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.58) 22.5%, rgba(0, 0, 0, 0.40) 43.5%, rgba(0, 0, 0, 0.25) 62%, rgba(0, 0, 0, 0.12) 77%, rgba(0, 0, 0, 0.06) 87.5%, rgba(0, 0, 0, 0.00) 100%);
  pointer-events: none;
}

.header>.inner {
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.home {
  display: flex;
  gap: var(--space-xxs);
  align-items: center;
}

.home img {
  width: 7.4rem;
  height: 3.2rem;
}

.burger {
  width: 6.2rem;
  height: 4rem;
  background-image: url('data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgNjIgNDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik01IDQwSDQ3LjU3MjVDNDguNzg0NCA0MCA0OS45NTUgMzkuNTU5NiA1MC44NjY3IDM4Ljc2MTdMNjAuMjk0MiAzMC41MDQ5QzYxLjM3ODMgMjkuNTU1NyA2MiAyOC4xODQ2IDYyIDI2Ljc0MzJWNUM2MiAyLjIzODI4IDU5Ljc2MTQgMCA1NyAwSDE0LjQyNzVDMTMuMjE1NiAwIDEyLjA0NSAwLjQ0MDQzIDExLjEzMzMgMS4yMzgyOEwxLjcwNTc4IDkuNDk1MTJDMC42MjE3MzUgMTAuNDQ0MyAwIDExLjgxNTQgMCAxMy4yNTY4VjM1QzAgMzcuNzYxNyAyLjIzODU5IDQwIDUgNDBaIiBmaWxsPSIjMjgyODI4IiBmaWxsLW9wYWNpdHk9IjAuOTYiLz4KPC9zdmc+');
  background-repeat: no-repeat;
  background-size: contain;
  color: transparent;
  position: relative;
}

.burger::before,
.burger::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  margin: -.1rem -.8rem;
  width: 1.6rem;
  height: .2rem;
  background-color: #fff;
  transition: transform 0.3s ease;
}

.burger::before {
  transform: translateY(-.4rem);
}

.burger::after {
  transform: translateY(.4rem);
}

.burger.open::before {
  transform: rotate(216deg);
}

.burger.open::after {
  transform: rotate(-36deg);
}

.nav,
.main-nav {
  display: flex;
}

.nav-item {
  padding: var(--space-xxs) var(--space-xs);
  background-color: transparent;
  border-radius: var(--space-3xs);
  transition: opacity 0.3s ease, background-color 0.3s ease;
  display: flex;
  gap: var(--space-3xs);
}

.nav-item svg {
  width: 1.25em;
  height: 1.25em;
}

@media (max-width: 799px) {
  .nav {
    background-color: #fff;
    border-radius: var(--space-xxs);
    color: #000;
    position: absolute;
    right: var(--space-xs);
    top: 7.2rem;
    flex-direction: column;
    padding: var(--space-xxs);
    width: 20rem;
    transition: opacity 0.3s ease, visibility 0.3s ease, transform 0.3s ease;
    opacity: 0;
    visibility: hidden;
    transform: translateY(-1rem);
  }

  .nav.open {
    visibility: visible;
    opacity: 1;
    transform: translateY(0);
  }

  .main-nav {
    flex-direction: column;
  }

  .nav-item.active {
    background-color: #f1f1f1;
  }

  .download {
    margin-top: var(--space-xs);
  }
}

@media (min-width: 800px) {
  .home {
    gap: var(--space-m);
  }

  .nav {
    justify-content: space-between;
    flex: 1;
    gap: var(--space-s);
    align-items: center;
  }

  .main-nav {
    flex: 1;
    align-items: center;
  }

  .nav-item {
    justify-content: center;
  }

  .home.active .nav-item,
  .nav-item.active {
    background-color: #191919;
  }

  .burger {
    display: none;
  }
}

@media (hover: hover) and (min-width: 800px) {

  .home:not(.active):hover>.nav-item,
  *:not(.active)>.nav-item:not(.active):hover {
    opacity: 0.7;
  }
}
</style>