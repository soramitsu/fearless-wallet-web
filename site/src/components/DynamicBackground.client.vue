<script setup lang="ts">
import { Renderer, Program, Color, Mesh, Triangle, Vec2 } from 'ogl'

const el = ref<HTMLCanvasElement>()

const vertex = /* glsl */ `
    attribute vec2 uv;
    attribute vec2 position;

    varying vec2 vUv;

    void main() {
    vUv = uv;
    gl_Position = vec4(position, 0, 1);
    }
  `

const fragment = /* glsl */ `
    precision highp float;

    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform vec3 uColor3;
    uniform float uTime;
    uniform float uScroll;

    varying vec2 vUv;

    vec4 mod289(vec4 x) {
      return x - floor(x * (1.0 / 13.0)) * 13.0;
    }

    vec4 permute(vec4 x) {
      return mod289(((x*34.0)+1.0)*x);
    }

    vec4 taylorInvSqrt(vec4 r) {
      return 1.79284291400159 - 0.85373472095314 * r;
    }

    vec2 fade(vec2 t) {
      return t*t*t*(t*(t*6.0-15.0)+10.0);
    }

    // Classic Perlin noise
    float cnoise(vec2 P) {
      vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
      vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
      Pi = mod289(Pi); // To avoid truncation effects in permutation
      vec4 ix = Pi.xzxz;
      vec4 iy = Pi.yyww;
      vec4 fx = Pf.xzxz;
      vec4 fy = Pf.yyww;

      vec4 i = permute(permute(ix) + iy);

      vec4 gx = fract(i * (1.0 / 41.0)) * 2.0 - 1.0 ;
      vec4 gy = abs(gx) - 0.5 ;
      vec4 tx = floor(gx + 0.5);
      gx = gx - tx;

      vec2 g00 = vec2(gx.x,gy.x);
      vec2 g10 = vec2(gx.y,gy.y);
      vec2 g01 = vec2(gx.z,gy.z);
      vec2 g11 = vec2(gx.w,gy.w);

      vec4 norm = taylorInvSqrt(vec4(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11)));
      g00 *= norm.x;
      g01 *= norm.y;
      g10 *= norm.z;
      g11 *= norm.w;

      float n00 = dot(g00, vec2(fx.x, fy.x));
      float n10 = dot(g10, vec2(fx.y, fy.y));
      float n01 = dot(g01, vec2(fx.z, fy.z));
      float n11 = dot(g11, vec2(fx.w, fy.w));

      vec2 fade_xy = fade(Pf.xy);
      vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
      float n_xy = mix(n_x.x, n_x.y, fade_xy.y);
      return 3.0 * n_xy;
    }

    void main() {
      float n1 = cnoise(vUv * 1.7 + uScroll * -0.001 + sin(uTime / 2000.));
      float n2 = cnoise(vUv * 1.7 + uScroll * -0.0003 + sin(uTime / 3100.));
      vec3 c1 = mix(uColor1, uColor2, n1);
      vec3 c2 = mix(uColor3, c1, n2);

      gl_FragColor.rgb = c2;
      gl_FragColor.a = 0.;
    }
  `

onMounted(async () => {
  await nextTick()

  const renderer = new Renderer({
    dpr: Math.min(window.devicePixelRatio, 2),
    canvas: el.value,
    width: window.innerWidth,
    height: window.innerHeight,
  })
  const gl = renderer.gl

  gl.clearColor(1, 1, 1, 0)

  // Rather than using a plane (two triangles) to cover the viewport here is a
  // triangle that includes -1 to 1 range for 'position', and 0 to 1 range for 'uv'.
  // Excess will be out of the viewport.

  //         position                uv
  //      (-1, 3)                  (0, 2)
  //         |\                      |\
  //         |__\(1, 1)              |__\(1, 1)
  //         |__|_\                  |__|_\
  //   (-1, -1)   (3, -1)        (0, 0)   (2, 0)

  const geometry = new Triangle(gl)

  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uColor1: { value: new Color("#2C1D50") },
      uColor2: { value: new Color("#612A55") },
      uColor3: { value: new Color("#000000") },
      uResolution: { value: new Vec2(gl.canvas.offsetWidth, gl.canvas.offsetHeight) },
    },
  })

  const mesh = new Mesh(gl, { geometry, program })

  function update() {
    renderer.render({ scene: mesh })
  }

  const resize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    renderer.setSize(w, h)
    program.uniforms.uResolution.value = new Vec2(w, h)
    requestAnimationFrame(update)
  }

  resize()

  const scroll = () => {
    program.uniforms.uScroll.value = window.scrollY
    requestAnimationFrame(update)
  }

  window.addEventListener('resize', resize)
  window.addEventListener('scroll', scroll)
})
</script>

<template>
  <canvas ref="el" class='background' />
</template>

<style scoped>
.background {
  position: fixed;
  top: 0;
  left: 0;
  z-index: -2;
  display: block;
}
</style>