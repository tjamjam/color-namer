const GRAD: number[][] = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]
const PERM = new Uint8Array(512)

;(function seedNoise() {
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]
})()

export function simplex2(x: number, y: number): number {
  const F2 = 0.5 * (Math.sqrt(3) - 1)
  const G2 = (3 - Math.sqrt(3)) / 6
  const s = (x + y) * F2
  const i = Math.floor(x + s), j = Math.floor(y + s)
  const t = (i + j) * G2
  const x0 = x - (i - t), y0 = y - (j - t)
  const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2
  const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2
  const ii = i & 255, jj = j & 255
  function dot(gi: number, px: number, py: number) { const g = GRAD[gi % 8]; return g[0]*px + g[1]*py }
  let n0 = 0, n1 = 0, n2 = 0
  let t0 = 0.5 - x0*x0 - y0*y0
  if (t0 > 0) { t0 *= t0; n0 = t0 * t0 * dot(PERM[ii + PERM[jj]], x0, y0) }
  let t1 = 0.5 - x1*x1 - y1*y1
  if (t1 > 0) { t1 *= t1; n1 = t1 * t1 * dot(PERM[ii + i1 + PERM[jj + j1]], x1, y1) }
  let t2 = 0.5 - x2*x2 - y2*y2
  if (t2 > 0) { t2 *= t2; n2 = t2 * t2 * dot(PERM[ii + 1 + PERM[jj + 1]], x2, y2) }
  return 70 * (n0 + n1 + n2)
}
