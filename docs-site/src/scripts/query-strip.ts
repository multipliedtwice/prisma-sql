interface Lane {
  label: string
  version: string
  values: (number | null)[]
}

interface Payload {
  names: string[]
  lanes: Lane[]
}

const COLORS = {
  faster: '#F2A900',
  slower: '#8FA6B3',
  grid: 'rgba(214, 227, 232, 0.10)',
  baseline: 'rgba(214, 227, 232, 0.38)',
  label: '#B7C9D2',
  tick: '#6F8896',
}

const GRID_STEPS = [2, 5, 10, 20]
const FONT = '"Schibsted Grotesk Variable", ui-sans-serif, system-ui, sans-serif'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

function isPayload(value: unknown): value is Payload {
  return typeof value === 'object' && value !== null && 'names' in value && 'lanes' in value
}

function initStrip(figure: HTMLElement) {
  const canvas = figure.querySelector<HTMLCanvasElement>('[data-query-canvas]')
  const caption = figure.querySelector<HTMLElement>('[data-query-caption]')
  const raw = figure.querySelector('[data-query-data]')?.textContent
  const ctx = canvas?.getContext('2d')
  if (!canvas || !caption || !raw || !ctx) return

  const parsed: unknown = JSON.parse(raw)
  if (!isPayload(parsed)) return
  const { names, lanes } = parsed

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const idleCaption = figure.dataset.caption ?? ''
  const formatSpeed = (value: number | null) => {
    if (value === null) return figure.dataset.notRun ?? ''
    const template = (value >= 1 ? figure.dataset.faster : figure.dataset.slower) ?? '{value}×'
    return template.replace('{value}', value.toFixed(2))
  }
  const all = lanes.flatMap((lane) => lane.values).filter((v): v is number => v !== null && v > 0)
  const logMax = Math.log(Math.max(2, ...all))

  let width = 0
  let height = 0
  let progress = reduceMotion ? 1 : 0
  let active = -1
  let queued = false

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    width = canvas.clientWidth
    height = canvas.clientHeight
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  const draw = () => {
    queued = false
    ctx.clearRect(0, 0, width, height)
    const gutter = width < 640 ? 0 : 28
    const plotW = width - gutter
    const laneGap = 18
    const laneH = (height - laneGap * (lanes.length - 1)) / lanes.length
    const colW = plotW / names.length
    const barW = Math.max(1, Math.min(colW * 0.62, 10))

    lanes.forEach((lane, laneIndex) => {
      const top = laneIndex * (laneH + laneGap)
      const labelH = 20
      const baseline = top + labelH + (laneH - labelH) * 0.84
      const upMax = baseline - top - labelH
      const downMax = top + laneH - baseline
      const length = (value: number) => (Math.log(value) / logMax) * upMax

      ctx.font = `600 12px ${FONT}`
      ctx.fillStyle = COLORS.label
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'
      ctx.fillText(lane.label, 0, top)

      ctx.font = `500 10px ${FONT}`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      GRID_STEPS.forEach((step) => {
        const y = baseline - length(step)
        if (y < top + labelH) return
        ctx.fillStyle = COLORS.grid
        ctx.fillRect(0, Math.round(y), plotW, 1)
        if (gutter) {
          ctx.fillStyle = COLORS.tick
          ctx.fillText(`${step}×`, width, y)
        }
      })

      lane.values.forEach((value, i) => {
        if (value === null || value <= 0) return
        const grow = easeOutCubic(clamp(progress * 1.6 - (i / names.length) * 0.6, 0, 1))
        if (grow <= 0) return
        const x = i * colW + (colW - barW) / 2
        const faster = value >= 1
        const size = Math.max(2, Math.min(Math.abs(length(value)), faster ? upMax : downMax)) * grow
        ctx.globalAlpha = active === -1 || active === i ? 1 : 0.28
        ctx.fillStyle = faster ? COLORS.faster : COLORS.slower
        ctx.fillRect(x, faster ? baseline - size : baseline, barW, size)
      })
      ctx.globalAlpha = 1

      ctx.fillStyle = COLORS.baseline
      ctx.fillRect(0, Math.round(baseline), plotW, 1)
      if (gutter) {
        ctx.fillStyle = COLORS.label
        ctx.fillText('1×', width, baseline)
      }
    })

    if (active !== -1) {
      ctx.fillStyle = 'rgba(214, 227, 232, 0.5)'
      ctx.fillRect(Math.round(active * colW + colW / 2), 0, 1, height)
    }
  }

  const queue = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(draw)
  }

  const updateProgress = () => {
    if (reduceMotion) return
    const rect = figure.getBoundingClientRect()
    const vh = window.innerHeight
    const next = clamp((vh - rect.top) / (vh * 0.65), 0, 1)
    if (next !== progress) {
      progress = next
      queue()
    }
  }

  const setActive = (clientX: number) => {
    const rect = canvas.getBoundingClientRect()
    const gutter = rect.width < 640 ? 0 : 28
    const index = Math.floor(((clientX - rect.left) / (rect.width - gutter)) * names.length)
    const next = index >= 0 && index < names.length ? index : -1
    if (next === active) return
    active = next
    caption.textContent =
      active === -1
        ? idleCaption
        : `${names[active]} · ${lanes.map((lane) => `${lane.label} ${formatSpeed(lane.values[active])}`).join(' · ')}`
    queue()
  }

  canvas.addEventListener('pointermove', (event) => setActive(event.clientX))
  canvas.addEventListener('pointerdown', (event) => setActive(event.clientX))
  canvas.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse') setActive(-Infinity)
  })

  new ResizeObserver(() => {
    resize()
    queue()
  }).observe(canvas)
  window.addEventListener('scroll', updateProgress, { passive: true })
  document.fonts?.ready.then(queue)
  updateProgress()
}

document.querySelectorAll<HTMLElement>('[data-query-strip]').forEach(initStrip)
