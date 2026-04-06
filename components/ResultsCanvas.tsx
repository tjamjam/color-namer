import { useEffect, useRef, useMemo } from "react"

export interface ClusterDef {
  name: string
  pct: number
  count: number
  pool: [number, number, number][]
  x: number      // CSS px, top-left origin
  y: number      // CSS px, top-left origin
  r: number      // CSS px radius
  isUser: boolean
}

// ---- Shaders ----------------------------------------------------------------

const VERTEX_SRC = `
  attribute vec2 aPos;
  void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAGMENT_SRC = `
  precision mediump float;

  uniform sampler2D uPool;
  uniform float     uPoolWidth;
  uniform vec2      uCenters[8];
  uniform float     uRadii[8];
  uniform float     uOffsets[8];
  uniform float     uCounts[8];
  uniform vec2      uResolution;
  uniform float     uTime;
  // Hash without sine — avoids diagonal banding (from ColorGrid.tsx)
  float rand(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 19.19);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    // Find the nearest cluster this pixel falls inside.
    // Inactive clusters have uRadii[i] == 0 and are skipped naturally.
    float hitRadius = 0.0;
    float hitCount  = 1.0;
    float hitOffset = 0.0;
    float minDist   = 1e9;
    bool  inCluster = false;

    for (int i = 0; i < 8; i++) {
      float r = uRadii[i];
      if (r <= 0.0) continue;
      float d = distance(gl_FragCoord.xy, uCenters[i]);
      if (d < r && d < minDist) {
        minDist   = d;
        hitRadius = r;
        hitCount  = uCounts[i];
        hitOffset = uOffsets[i];
        inCluster = true;
      }
    }

    if (!inCluster) { gl_FragColor = vec4(0.0); return; }

    // One color per pixel: pick a random chip from this cluster's pool,
    // cycling at RATE with a per-pixel phase offset.
    const float RATE = 0.6;
    vec2  block = floor(gl_FragCoord.xy / 2.0);
    float phase = rand(block * 7.3);
    float t0    = floor(uTime * RATE + phase);
    vec2  off0  = vec2(t0 * 127.1, t0 * 311.7);

    #define S(rv) texture2D(uPool, vec2((hitOffset + floor((rv) * hitCount) + 0.5) / uPoolWidth, 0.5)).rgb
    vec3 col = S(rand(block + off0));
    #undef S

    // Hard circular edge
    float alpha = step(minDist, hitRadius);

    // Faint white border near the circle edge
    const float BORDER = 4.0;
    float inBorder = step(hitRadius - BORDER, minDist) * alpha;
    col = mix(col, vec3(1.0), inBorder * 0.35);

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

function buildPoolTexture(clusters: ClusterDef[]) {
  const offsets: number[] = []
  const counts:  number[] = []
  let total = 0
  for (const c of clusters) {
    offsets.push(total)
    const count = Math.max(c.pool.length, 1)
    counts.push(count)
    total += count
  }
  const width  = Math.max(total, 1)
  const pixels = new Uint8Array(width * 4)
  let pos = 0
  for (const c of clusters) {
    if (c.pool.length === 0) {
      pixels[pos * 4 + 3] = 255  // opaque black placeholder
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
  }
  return { pixels, width, offsets, counts }
}

// ---- Component --------------------------------------------------------------

export default function ResultsCanvas({ clusters }: { clusters: ClusterDef[] }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const glRef      = useRef<WebGLRenderingContext | null>(null)
  const rafRef     = useRef<number>(0)
  const poolTexRef = useRef<WebGLTexture | null>(null)

  const clustersRef    = useRef<ClusterDef[]>([])
  const poolWidthRef   = useRef(1)
  const offsetsRef     = useRef<number[]>([])
  const countsRef      = useRef<number[]>([])

  // Uniform locations
  const uRes         = useRef<WebGLUniformLocation | null>(null)
  const uTime_       = useRef<WebGLUniformLocation | null>(null)
  const uPoolWidth_  = useRef<WebGLUniformLocation | null>(null)
  const uCenters_    = useRef<WebGLUniformLocation | null>(null)
  const uRadii_      = useRef<WebGLUniformLocation | null>(null)
  const uOffsets_    = useRef<WebGLUniformLocation | null>(null)
  const uCounts_     = useRef<WebGLUniformLocation | null>(null)

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
    uPoolWidth_.current = gl.getUniformLocation(prog, "uPoolWidth")
    uCenters_.current   = gl.getUniformLocation(prog, "uCenters[0]")
    uRadii_.current     = gl.getUniformLocation(prog, "uRadii[0]")
    uOffsets_.current   = gl.getUniformLocation(prog, "uOffsets[0]")
    uCounts_.current    = gl.getUniformLocation(prog, "uCounts[0]")

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

    function draw(ts: number) {
      const gl     = glRef.current
      const canvas = canvasRef.current
      if (!gl || !canvas) return

      const dpr = window.devicePixelRatio ?? 1
      const cls = clustersRef.current
      const n   = Math.min(cls.length, 8)

      const centersFlat = new Float32Array(16)  // 8 × vec2
      const radiiFlat   = new Float32Array(8)
      const offsetsFlat = new Float32Array(8)
      const countsFlat  = new Float32Array(8).fill(1)

      for (let i = 0; i < n; i++) {
        const c = cls[i]
        centersFlat[i * 2]     = c.x * dpr
        centersFlat[i * 2 + 1] = canvas.height - c.y * dpr   // flip Y (WebGL origin = bottom-left)
        radiiFlat[i]   = c.r * dpr
        offsetsFlat[i] = offsetsRef.current[i] ?? 0
        countsFlat[i]  = Math.max(countsRef.current[i] ?? 1, 1)
      }

      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)

      gl.uniform2f(uRes.current,         canvas.width, canvas.height)
      gl.uniform1f(uTime_.current,       ts / 1000)
      gl.uniform1f(uPoolWidth_.current,  poolWidthRef.current)
      gl.uniform2fv(uCenters_.current,   centersFlat)
      gl.uniform1fv(uRadii_.current,     radiiFlat)
      gl.uniform1fv(uOffsets_.current,   offsetsFlat)
      gl.uniform1fv(uCounts_.current,    countsFlat)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, poolTexRef.current)
      gl.drawArrays(gl.TRIANGLES, 0, 6)

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // Rebuild pool texture when clusters change
  useEffect(() => {
    const gl = glRef.current
    if (gl && poolTexRef.current && clusters.length > 0) {
      const { pixels, width, offsets, counts } = buildPoolTexture(clusters)
      poolWidthRef.current = width
      offsetsRef.current   = offsets
      countsRef.current    = counts

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, poolTexRef.current)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    }
    // Update clustersRef last so the draw loop never sees new circles with stale texture/offsets
    clustersRef.current = clusters
  }, [clusters])

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        canvas.width  = Math.round(e.contentRect.width  * devicePixelRatio)
        canvas.height = Math.round(e.contentRect.height * devicePixelRatio)
      }
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  return (
    <canvas
      ref={canvasRef}
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
