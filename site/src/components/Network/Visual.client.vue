<script setup lang="ts">
import { Engine, Render, Runner, Bodies, Body, Composite, MouseConstraint, Mouse } from 'matter-js'

const networks = [
  '/networks/ton.svg',
  '/networks/SORA.svg',
  '/networks/Polkadot.svg',
  '/networks/Kusama.svg',
  '/networks/Pendulum.svg',
  '/networks/Moonriver.svg',
  '/networks/Moonbeam.svg',
  '/networks/xlayerchain.svg',
  '/networks/homeverse.svg',
  '/networks/Ethereum.svg',
  '/networks/bnbchain.svg',
  '/networks/Polygon.svg',
  '/networks/Arbitrum.svg',
  '/networks/Optimism.svg',
  '/networks/Avalanche.svg',
  '/networks/Zetachain.svg',
  '/networks/oasys.svg',
  '/networks/mchverse.svg',
  '/networks/tcgverse.svg',
  '/networks/chainverse.svg',
  '/networks/saakuruverse.svg',
  '/networks/yooldoverse.svg',
  '/networks/acala.svg',
  '/networks/Karura.svg',
  '/networks/Bifrost.svg',
  '/networks/Basilisk.svg',
  '/networks/phala.svg',
  '/networks/clover.svg',
  '/networks/Amplitude.svg',
  '/networks/Bitgreen.svg',
  '/networks/Pendulum.svg',
  '/networks/quartz.svg',
]

const parent = shallowRef()
const canvas = shallowRef()

let resizeHandler: () => void

onMounted(async () => {
  await nextTick()
  if (!canvas.value || !parent.value) return

  // create an engine

  const engine = Engine.create(),
    world = engine.world

  // create a renderer

  const render = Render.create({
    canvas: canvas.value,
    engine: engine,
    options: {
      width: parent.value.clientWidth,
      height: parent.value.clientHeight,
      showAngleIndicator: false,
      wireframes: false,
      background: 'transparent',
      pixelRatio: window.devicePixelRatio || 1
    }
  })

  // create runner

  const runner = Runner.create()

  // create walls

  const wallOptions = {
    isStatic: true,
    render: {
      visible: false,
      lineWidth: 20
    }
  }
  const wallWidth = 1000
  const wallHeight = 1600
  const ethalonArea = 600000
  const multiplayer = Math.sqrt(ethalonArea / (parent.value.clientWidth * parent.value.clientHeight))
  const width = parent.value.clientWidth * multiplayer
  const height = parent.value.clientHeight * multiplayer

  const top = Bodies.rectangle(wallHeight / 2, -wallWidth / 2, wallHeight, wallWidth, wallOptions)
  const floor = Bodies.rectangle(wallHeight / 2, height + wallWidth / 2, wallHeight, wallWidth, wallOptions)
  const leftWall = Bodies.rectangle(-wallWidth / 2, wallHeight / 2, wallWidth, wallHeight, wallOptions)
  const rightWall = Bodies.rectangle(width + wallWidth / 2, wallHeight / 2, wallWidth, wallHeight, wallOptions)

  // create chain icons

  const elementSize = 18

  const chains = networks.map((network, i) => {
    const size = elementSize + networks.length - i
    return Bodies.circle(Math.random() * width, Math.random() * height / 1.5, size, {
      density: 0.0006,
      frictionAir: 0.01,
      restitution: 0.03,
      friction: 0.01,
      render: {
        sprite: {
          texture: network,
          xScale: size / 24,
          yScale: size / 24,
        }
      }
    })
  })

  // add mouse control

  const mouse = Mouse.create(render.canvas)
  const mouseConstraint = MouseConstraint.create(engine, {
    mouse: mouse,
    constraint: {
      stiffness: 0.2,
      render: {
        visible: false
      }
    }
  })

  // keep scroll of the page

  // @ts-ignore
  mouse.element.removeEventListener('wheel', mouse.mousewheel)

  Composite.add(world, [top, floor, leftWall, rightWall, ...chains, mouseConstraint])

  // keep the mouse in sync with rendering

  render.mouse = mouse

  // fit the render viewport to the scene

  Render.lookAt(render, {
    min: { x: 0, y: 0 },
    max: { x: width, y: height }
  })

  // create intersection observer

  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        Runner.run(runner, engine)
        Render.run(render)

        // pull the coins up
        chains.forEach(body => {
          const forceMagnitude = 0.02 * body.mass

          Body.applyForce(body, body.position, {
            x: 0,
            y: -forceMagnitude - Math.random() * forceMagnitude
          })
        })
      } else {
        Runner.stop(runner)
        Render.stop(render)
      }
    })
  })

  observer.observe(canvas.value)

  // resize canvas

  resizeHandler = () => {
    const multiplayer = Math.sqrt(ethalonArea / (parent.value.clientWidth * parent.value.clientHeight))
    const width = parent.value.clientWidth * multiplayer
    const height = parent.value.clientHeight * multiplayer

    const dx = width + wallWidth / 2 - rightWall.position.x
    const dy = height + wallWidth / 2 - floor.position.y

    // @ts-ignore
    Render.setSize(render, parent.value.clientWidth, parent.value.clientHeight)

    Body.translate(rightWall, { x: dx, y: 0 })
    Body.translate(floor, { x: 0, y: dy })

    Render.lookAt(render, {
      min: { x: 0, y: 0 },
      max: { x: width, y: height }
    })
  }

  window.addEventListener('resize', resizeHandler)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeHandler)
})
</script>

<template>
  <div class="parent" ref="parent"><canvas ref="canvas" /></div>
</template>

<style scoped>
.parent {
  position: relative;
  overflow: hidden;
}

.parent canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
</style>