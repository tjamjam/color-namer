import { useEffect, useRef } from "react"

export type ResultsCanvasMode = "circles" | "squares-split"

export interface ClusterDef {
  name:   string
  pct:    number
  count:  number
  pool:   [number, number, number][]
  poolR?: [number, number, number][]   // squares-split mode: right half ("crowd")
  x:      number   // CSS px, top-left origin
  y:      number   // CSS px, top-left origin
  r:      number   // CSS px. Radius in circle mode, half-side in squares mode.
  isUser: boolean
}

// ---- Shaders ----------------------------------------------------------------

const VERTEX_SRC = `
  attribute vec2 aPos;
  void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

// Array sizes below MUST match MAX_GRID_CLUSTERS in lib/useColorResults.ts.
// MAX_DISPLAYED (= 8) caps the after-naming view's data fetch; the shader
// array is sized for the larger "your colors so far" grid view. Inactive
// slots have radius 0 and are skipped at the top of the loop.
//
// uMode: 0 = circles (single pool from uOffsetsL/uCountsL).
//        1 = squares-split (vertical halves; left uses uOffsetsL/uCountsL,
//                            right uses uOffsetsR/uCountsR; empty right
//                            renders as a dim neutral).
const FRAGMENT_SRC = `
  precision mediump float;

  uniform sampler2D uPool;
  uniform float     uPoolWidth;
  uniform vec2      uCenters[64];
  uniform float     uRadii[64];
  uniform float     uOffsetsL[64];
  uniform float     uCountsL[64];
  uniform float     uOffsetsR[64];
  uniform float     uCountsR[64];
  uniform vec2      uResolution;
  uniform float     uTime;
  uniform float     uDPR;
  uniform int       uMode;

  // Hash without sine, avoids diagonal banding (from ColorGrid.tsx)
  float rand(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 19.19);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    // Find the nearest cluster this pixel falls inside.
    float hitRadius   = 0.0;
    float hitOffsetL  = 0.0;
    float hitCountL   = 1.0;
    float hitOffsetR  = 0.0;
    float hitCountR   = 0.0;
    vec2  hitDelta    = vec2(0.0);
    float minDist     = 1e9;
    bool  inCluster   = false;

    for (int i = 0; i < 64; i++) {
      float r = uRadii[i];
      if (r <= 0.0) continue;
      vec2  delta = gl_FragCoord.xy - uCenters[i];
      float dist  = (uMode == 0) ? length(delta) : max(abs(delta.x), abs(delta.y));
      if (dist < r && dist < minDist) {
        minDist     = dist;
        hitRadius   = r;
        hitOffsetL  = uOffsetsL[i];
        hitCountL   = uCountsL[i];
        hitOffsetR  = uOffsetsR[i];
        hitCountR   = uCountsR[i];
        hitDelta    = delta;
        inCluster   = true;
      }
    }

    if (!inCluster) { gl_FragColor = vec4(0.0); return; }

    // Pick which pool to sample from for this pixel.
    float hitOffset = hitOffsetL;
    float hitCount  = hitCountL;
    bool  isRight   = (uMode == 1) && (hitDelta.x >= 0.0);
    bool  emptyHalf = false;
    if (isRight) {
      if (hitCountR <= 0.0) {
        emptyHalf = true;
      } else {
        hitOffset = hitOffsetR;
        hitCount  = hitCountR;
      }
    }

    vec3 col;
    if (emptyHalf) {
      // Dim neutral signals "no crowd data for this name"
      col = vec3(0.18, 0.18, 0.20);
    } else {
      // One color per pixel: pick a random chip from this cluster's pool,
      // cycling at RATE with a per-pixel phase offset.
      const float RATE = 0.6;
      vec2  block = floor(gl_FragCoord.xy / uDPR);
      float phase = rand(block * 7.3);
      float t0    = floor(uTime * RATE + phase);
      vec2  off0  = vec2(t0 * 127.1, t0 * 311.7);

      #define S(rv) texture2D(uPool, vec2((hitOffset + floor((rv) * hitCount) + 0.5) / uPoolWidth, 0.5)).rgb
      col = S(rand(block + off0));
      #undef S
    }

    // Hard edge. Circles keep a faint white rim; squares get no border or
    // divider so the two halves butt up cleanly.
    float alpha = step(minDist, hitRadius);
    if (uMode == 0) {
      const float BORDER = 4.0;
      float edge = step(hitRadius - BORDER, minDist) * alpha;
      col = mix(col, vec3(1.0), edge * 0.35);
    }

    gl_FragColor = vec4(col, alpha);
  }
`

// ---- WebGL helpers ----------------------------------------------------------

function compileShader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) ?? "Shader error")
  return s
}

function newTex(gl: WebGLRenderingContext): WebGLTexture {
  const t = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return t
}

interface PoolTextureBuild {
  pixels:   Uint8Array
  width:    number
  offsetsL: number[]
  countsL:  number[]
  offsetsR: number[]
  countsR:  number[]
}

function buildPoolTexture(clusters: ClusterDef[]): PoolTextureBuild {
  const offsetsL: number[] = []
  const countsL:  number[] = []
  const offsetsR: number[] = []
  const countsR:  number[] = []

  let total = 0
  for (const c of clusters) {
    // Left pool always reserves at least 1 slot so the texture has a valid sample.
    offsetsL.push(total)
    const lCount = Math.max(c.pool.length, 1)
    countsL.push(lCount)
    total += lCount

    // Right pool. Empty when poolR is missing; the shader renders the dim
    // neutral instead of sampling.
    const r = c.poolR ?? []
    offsetsR.push(total)
    countsR.push(r.length)
    total += r.length
  }

  const width  = Math.max(total, 1)
  const pixels = new Uint8Array(width * 4)
  let pos = 0
  for (const c of clusters) {
    if (c.pool.length === 0) {
      pixels[pos * 4 + 3] = 255  // opaque black placeholder for empty L
      pos++
    } else {
      for (const [r, g, b] of c.pool) {
        pixels[pos * 4]     = r
        pixels[pos * 4 + 1] = g
        pixels[pos * 4 + 2] = b
        pixels[pos * 4 + 3] = 255
        pos++
      }
    }
    for (const [r, g, b] of c.poolR ?? []) {
      pixels[pos * 4]     = r
      pixels[pos * 4 + 1] = g
      pixels[pos * 4 + 2] = b
      pixels[pos * 4 + 3] = 255
      pos++
    }
  }

  return { pixels, width, offsetsL, countsL, offsetsR, countsR }
}

// ---- Component --------------------------------------------------------------

// Cap DPR at 1.5. Rendering at full 3x on retina gives no visible benefit
// but triples the fragment shader workload.
const getDPR = () => Math.min(window.devicePixelRatio ?? 1, 1.5)

export default function ResultsCanvas({
  clusters,
  mode = "circles",
}: {
  clusters: ClusterDef[]
  mode?:    ResultsCanvasMode
}) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const glRef      = useRef<WebGLRenderingContext | null>(null)
  const rafRef     = useRef<number>(0)
  const poolTexRef = useRef<WebGLTexture | null>(null)

  const clustersRef    = useRef<ClusterDef[]>([])
  const modeRef        = useRef<ResultsCanvasMode>(mode)
  const poolWidthRef   = useRef(1)
  const offsetsLRef    = useRef<number[]>([])
  const countsLRef     = useRef<number[]>([])
  const offsetsRRef    = useRef<number[]>([])
  const countsRRef     = useRef<number[]>([])

  // Uniform locations
  const uRes         = useRef<WebGLUniformLocation | null>(null)
  const uTime_       = useRef<WebGLUniformLocation | null>(null)
  const uDPR_        = useRef<WebGLUniformLocation | null>(null)
  const uPoolWidth_  = useRef<WebGLUniformLocation | null>(null)
  const uCenters_    = useRef<WebGLUniformLocation | null>(null)
  const uRadii_      = useRef<WebGLUniformLocation | null>(null)
  const uOffsetsL_   = useRef<WebGLUniformLocation | null>(null)
  const uCountsL_    = useRef<WebGLUniformLocation | null>(null)
  const uOffsetsR_   = useRef<WebGLUniformLocation | null>(null)
  const uCountsR_    = useRef<WebGLUniformLocation | null>(null)
  const uMode_       = useRef<WebGLUniformLocation | null>(null)

  // Initialize WebGL once
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false })
    if (!gl) return
    glRef.current = gl

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    let prog: WebGLProgram
    try {
      prog = gl.createProgram()!
      gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC))
      gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC))
      gl.linkProgram(prog)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(prog) ?? "Link error")
    } catch (e) {
      console.error("ResultsCanvas shader error:", e)
      return
    }
    gl.useProgram(prog)

    uRes.current        = gl.getUniformLocation(prog, "uResolution")
    uTime_.current      = gl.getUniformLocation(prog, "uTime")
    uDPR_.current       = gl.getUniformLocation(prog, "uDPR")
    uPoolWidth_.current = gl.getUniformLocation(prog, "uPoolWidth")
    uCenters_.current   = gl.getUniformLocation(prog, "uCenters[0]")
    uRadii_.current     = gl.getUniformLocation(prog, "uRadii[0]")
    uOffsetsL_.current  = gl.getUniformLocation(prog, "uOffsetsL[0]")
    uCountsL_.current   = gl.getUniformLocation(prog, "uCountsL[0]")
    uOffsetsR_.current  = gl.getUniformLocation(prog, "uOffsetsR[0]")
    uCountsR_.current   = gl.getUniformLocation(prog, "uCountsR[0]")
    uMode_.current      = gl.getUniformLocation(prog, "uMode")

    const verts = new Float32Array([-1,-1, 1,-1, -1,1, 1,-1, 1,1, -1,1])
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(prog, "aPos")
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    gl.activeTexture(gl.TEXTURE0)
    poolTexRef.current = newTex(gl)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]))
    gl.uniform1i(gl.getUniformLocation(prog, "uPool"), 0)

    // Size canvas before the first frame so no stretched-pixel artifacts
    canvas.width  = Math.round(canvas.offsetWidth  * getDPR())
    canvas.height = Math.round(canvas.offsetHeight * getDPR())

    function draw(ts: number) {
      const gl     = glRef.current
      const canvas = canvasRef.current
      if (!gl || !canvas) return

      const dpr = getDPR()
      const cls = clustersRef.current
      const n   = Math.min(cls.length, 64)  // matches uCenters[64]

      const centersFlat  = new Float32Array(128)
      const radiiFlat    = new Float32Array(64)
      const offsetsLFlat = new Float32Array(64)
      const countsLFlat  = new Float32Array(64).fill(1)
      const offsetsRFlat = new Float32Array(64)
      const countsRFlat  = new Float32Array(64)

      for (let i = 0; i < n; i++) {
        const c = cls[i]
        centersFlat[i * 2]     = c.x * dpr
        centersFlat[i * 2 + 1] = canvas.height - c.y * dpr   // flip Y (WebGL origin = bottom-left)
        radiiFlat[i]    = c.r * dpr
        offsetsLFlat[i] = offsetsLRef.current[i] ?? 0
        countsLFlat[i]  = Math.max(countsLRef.current[i] ?? 1, 1)
        offsetsRFlat[i] = offsetsRRef.current[i] ?? 0
        countsRFlat[i]  = countsRRef.current[i] ?? 0
      }

      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)

      gl.uniform2f(uRes.current,         canvas.width, canvas.height)
      gl.uniform1f(uTime_.current,       ts / 1000)
      gl.uniform1f(uDPR_.current,        dpr)
      gl.uniform1f(uPoolWidth_.current,  poolWidthRef.current)
      gl.uniform1i(uMode_.current,       modeRef.current === "squares-split" ? 1 : 0)
      gl.uniform2fv(uCenters_.current,   centersFlat)
      gl.uniform1fv(uRadii_.current,     radiiFlat)
      gl.uniform1fv(uOffsetsL_.current,  offsetsLFlat)
      gl.uniform1fv(uCountsL_.current,   countsLFlat)
      gl.uniform1fv(uOffsetsR_.current,  offsetsRFlat)
      gl.uniform1fv(uCountsR_.current,   countsRFlat)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, poolTexRef.current)
      gl.drawArrays(gl.TRIANGLES, 0, 6)

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // Track mode changes (no shader recompile, just a uniform switch)
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  // Rebuild pool texture when clusters change
  useEffect(() => {
    const gl = glRef.current
    if (gl && poolTexRef.current && clusters.length > 0) {
      const built = buildPoolTexture(clusters)
      poolWidthRef.current = built.width
      offsetsLRef.current  = built.offsetsL
      countsLRef.current   = built.countsL
      offsetsRRef.current  = built.offsetsR
      countsRRef.current   = built.countsR

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, poolTexRef.current)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, built.width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, built.pixels)
    }
    // Update clustersRef last so the draw loop never sees new geometry with stale texture/offsets
    clustersRef.current = clusters
  }, [clusters])

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        canvas.width  = Math.round(e.contentRect.width  * getDPR())
        canvas.height = Math.round(e.contentRect.height * getDPR())
      }
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  )
}
