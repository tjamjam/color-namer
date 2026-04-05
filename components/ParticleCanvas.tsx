import { useEffect, useRef } from "react"
import { simplex2 } from "~lib/simplex"
import type { Color } from "~lib/palette"

const NUM = 15000
const NOISE_SCALE = 0.0012
const NOISE_STRENGTH = 0.8
const DAMPING = 0.96
const MOUSE_FORCE = 3.0

const VS = `
  attribute vec2 aPosition;
  attribute float aAlpha;
  attribute float aSize;
  uniform vec2 uResolution;
  varying float vAlpha;
  void main() {
    vec2 clipSpace = (aPosition / uResolution) * 2.0 - 1.0;
    clipSpace.y *= -1.0;
    gl_Position = vec4(clipSpace, 0.0, 1.0);
    gl_PointSize = aSize;
    vAlpha = aAlpha;
  }
`

const FS = `
  precision mediump float;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float circle = 1.0 - smoothstep(0.6, 1.0, d);
    gl_FragColor = vec4(uColor, vAlpha * circle);
  }
`

function compileShader(gl: WebGLRenderingContext, src: string, type: number): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s))
  }
  return s
}

export default function ParticleCanvas({ color }: { color: Color }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const colorRef = useRef(color)

  useEffect(() => {
    colorRef.current = color
  }, [color])

  useEffect(() => {
    const canvas = canvasRef.current!
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
    })!

    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    const mouse = { x: -9999, y: -9999 }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = window.innerWidth + "px"
      canvas.style.height = window.innerHeight + "px"
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()

    // Compile shaders
    const prog = gl.createProgram()!
    gl.attachShader(prog, compileShader(gl, VS, gl.VERTEX_SHADER))
    gl.attachShader(prog, compileShader(gl, FS, gl.FRAGMENT_SHADER))
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const aPosition = gl.getAttribLocation(prog, "aPosition")
    const aAlpha = gl.getAttribLocation(prog, "aAlpha")
    const aSize = gl.getAttribLocation(prog, "aSize")
    const uResolution = gl.getUniformLocation(prog, "uResolution")
    const uColor = gl.getUniformLocation(prog, "uColor")

    // Particle data
    const positions = new Float32Array(NUM * 2)
    const velocities = new Float32Array(NUM * 2)
    const alphas = new Float32Array(NUM)
    const sizes = new Float32Array(NUM)
    const baseAlphas = new Float32Array(NUM)

    function initParticles() {
      const w = window.innerWidth * dpr
      const h = window.innerHeight * dpr
      for (let i = 0; i < NUM; i++) {
        positions[i * 2] = Math.random() * w
        positions[i * 2 + 1] = Math.random() * h
        velocities[i * 2] = 0
        velocities[i * 2 + 1] = 0
        baseAlphas[i] = 0.15 + Math.random() * 0.35
        alphas[i] = baseAlphas[i]
        sizes[i] = (1.0 + Math.random() * 2.5) * dpr
      }
    }
    initParticles()

    const posBuf = gl.createBuffer()!
    const alphaBuf = gl.createBuffer()!
    const sizeBuf = gl.createBuffer()!

    let time = 0

    function simulate(dt: number) {
      const w = canvas.width
      const h = canvas.height
      const mouseRadius = 120 * dpr
      time += dt * 0.0003

      for (let i = 0; i < NUM; i++) {
        const ix = i * 2
        const iy = ix + 1
        let px = positions[ix]
        let py = positions[iy]

        const angle = simplex2(px * NOISE_SCALE + time, py * NOISE_SCALE + time * 0.7) * Math.PI * 2
        velocities[ix] += Math.cos(angle) * NOISE_STRENGTH
        velocities[iy] += Math.sin(angle) * NOISE_STRENGTH

        velocities[iy] += 0.03

        const dx = px - mouse.x
        const dy = py - mouse.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < mouseRadius && dist > 0.1) {
          const force = (1 - dist / mouseRadius) * MOUSE_FORCE
          velocities[ix] += (dx / dist) * force
          velocities[iy] += (dy / dist) * force
        }

        velocities[ix] *= DAMPING
        velocities[iy] *= DAMPING

        px += velocities[ix]
        py += velocities[iy]

        if (px < 0) px += w
        if (px > w) px -= w
        if (py < 0) py += h
        if (py > h) py -= h

        positions[ix] = px
        positions[iy] = py

        if (dist < mouseRadius * 1.5) {
          alphas[i] = Math.min(baseAlphas[i] + 0.2, 0.7)
        } else {
          alphas[i] += (baseAlphas[i] - alphas[i]) * 0.05
        }
      }
    }

    function render() {
      const w = canvas.width
      const h = canvas.height
      const col = colorRef.current

      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

      gl.useProgram(prog)
      gl.uniform2f(uResolution, w, h)

      const r = Math.min(col.rgb[0] + 60, 255) / 255
      const g = Math.min(col.rgb[1] + 60, 255) / 255
      const b = Math.min(col.rgb[2] + 60, 255) / 255
      gl.uniform3f(uColor, r, g, b)

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(aPosition)
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0)

      gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuf)
      gl.bufferData(gl.ARRAY_BUFFER, alphas, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(aAlpha)
      gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, 0, 0)

      gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf)
      gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(aSize)
      gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 0, 0)

      gl.drawArrays(gl.POINTS, 0, NUM)
    }

    let lastTime = 0
    let rafId: number

    function frame(ts: number) {
      const dt = lastTime ? ts - lastTime : 16
      lastTime = ts
      simulate(dt)
      render()
      rafId = requestAnimationFrame(frame)
    }
    rafId = requestAnimationFrame(frame)

    function onMouseMove(e: MouseEvent) {
      mouse.x = e.clientX * dpr
      mouse.y = e.clientY * dpr
    }
    function onMouseLeave() {
      mouse.x = -9999
      mouse.y = -9999
    }

    window.addEventListener("resize", resize)
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseleave", onMouseLeave)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseleave", onMouseLeave)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 1,
      }}
    />
  )
}
