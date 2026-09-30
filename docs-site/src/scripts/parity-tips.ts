const GAP = 10
const EDGE = 8

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function initParityTips(grid: HTMLElement) {
  const tip = document.querySelector<HTMLElement>('[data-tip]')
  if (!tip || typeof tip.showPopover !== 'function') return

  const section = grid.closest('section') ?? document
  const scroller = grid.closest<HTMLElement>('[data-tip-scroll]')
  const tiles = Array.from(grid.querySelectorAll<HTMLButtonElement>('[data-tile]'))
  const lanes = ['pg', 'sqlite'].map((db) => tiles.filter((t) => t.dataset.db === db))
  let current: HTMLButtonElement | null = null
  let hideTimer = 0

  const templateFor = (tile: HTMLElement) =>
    section.querySelector<HTMLTemplateElement>(`template[data-tip-content="${tile.dataset.tile}"]`)

  const position = () => {
    if (!current) return
    const r = current.getBoundingClientRect()
    const p = tip.getBoundingClientRect()
    const above = r.top - p.height - GAP
    const side = above >= EDGE ? 'top' : 'bottom'
    const top = side === 'top' ? above : r.bottom + GAP
    const left = clamp(r.left + r.width / 2 - p.width / 2, EDGE, window.innerWidth - p.width - EDGE)
    tip.dataset.side = side
    tip.style.top = `${Math.round(top)}px`
    tip.style.left = `${Math.round(left)}px`
    tip.style.setProperty('--ax', `${Math.round(r.left + r.width / 2 - left)}px`)
  }

  const mark = (tile: HTMLElement | null) => {
    tiles.forEach((t) => {
      t.classList.toggle('is-current', t === tile)
      t.classList.toggle('is-pair', !!tile && t !== tile && t.dataset.tile === tile.dataset.tile)
    })
  }

  const show = (tile: HTMLButtonElement) => {
    window.clearTimeout(hideTimer)
    if (current === tile && tip.matches(':popover-open')) return
    const template = templateFor(tile)
    if (!template) return
    current = tile
    tip.replaceChildren(template.content.cloneNode(true))
    tip.dataset.db = tile.dataset.db ?? ''
    if (!tip.matches(':popover-open')) tip.showPopover()
    mark(tile)
    position()
  }

  const hide = () => {
    window.clearTimeout(hideTimer)
    current = null
    mark(null)
    if (tip.matches(':popover-open')) tip.hidePopover()
  }

  const hideSoon = () => {
    window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(hide, 120)
  }

  const tileFrom = (target: EventTarget | null) =>
    target instanceof Element ? target.closest<HTMLButtonElement>('[data-tile]') : null

  const moveFocus = (tile: HTMLButtonElement | undefined) => {
    if (!tile) return
    tiles.forEach((t) => (t.tabIndex = t === tile ? 0 : -1))
    tile.focus()
  }

  grid.addEventListener('pointerover', (event) => {
    if (event.pointerType !== 'mouse') return
    const tile = tileFrom(event.target)
    if (tile) show(tile)
  })

  grid.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse' && document.activeElement?.closest('[data-tile]') !== current) hideSoon()
  })

  grid.addEventListener('click', (event) => {
    const tile = tileFrom(event.target)
    if (!tile) return
    if (current === tile && tip.matches(':popover-open') && event.detail > 0 && !window.matchMedia('(hover: hover)').matches) {
      hide()
      return
    }
    show(tile)
  })

  grid.addEventListener('focusin', (event) => {
    const tile = tileFrom(event.target)
    if (tile && tile.matches(':focus-visible')) show(tile)
  })

  grid.addEventListener('focusout', (event) => {
    if (!tileFrom(event.relatedTarget)) hideSoon()
  })

  grid.addEventListener('keydown', (event) => {
    const tile = tileFrom(event.target)
    if (!tile) return
    const laneIndex = tile.dataset.db === 'pg' ? 0 : 1
    const index = lanes[laneIndex].indexOf(tile)
    const lane = lanes[laneIndex]
    const next: Record<string, HTMLButtonElement | undefined> = {
      ArrowRight: lane[index + 1],
      ArrowLeft: lane[index - 1],
      ArrowDown: lanes[1][index],
      ArrowUp: lanes[0][index],
      Home: lane[0],
      End: lane[lane.length - 1],
    }
    if (event.key === 'Escape') {
      hide()
      return
    }
    if (!(event.key in next)) return
    event.preventDefault()
    moveFocus(next[event.key])
  })

  document.addEventListener('pointerdown', (event) => {
    if (current && !tileFrom(event.target) && !tip.contains(event.target instanceof Node ? event.target : null)) hide()
  })

  const reposition = () => {
    if (current) position()
  }
  window.addEventListener('scroll', reposition, { passive: true })
  window.addEventListener('resize', reposition)
  scroller?.addEventListener('scroll', reposition, { passive: true })

  section.querySelectorAll<HTMLElement>('[data-legend]').forEach((row) => {
    row.addEventListener('pointerenter', () => {
      tiles.forEach((t) => t.classList.toggle('is-dim', t.dataset.status !== row.dataset.legend))
    })
    row.addEventListener('pointerleave', () => {
      tiles.forEach((t) => t.classList.remove('is-dim'))
    })
  })
}

document.querySelectorAll<HTMLElement>('[data-tip-grid]').forEach(initParityTips)
