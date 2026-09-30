const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const lerp = (from: number, to: number, t: number) => from + (to - from) * t
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))

const all = (selector: string, root: ParentNode = document) => Array.from(root.querySelectorAll<HTMLElement>(selector))

function onceInView(elements: Element[], onEnter: (el: HTMLElement) => void, rootMargin = '0px 0px -12% 0px') {
  if (!elements.length) return
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        io.unobserve(entry.target)
        onEnter(entry.target as HTMLElement)
      })
    },
    { rootMargin, threshold: 0.01 },
  )
  elements.forEach((el) => io.observe(el))
}

function indexChildren(selector: string, childSelector: string, prop: string) {
  all(selector).forEach((group) => {
    all(childSelector, group).forEach((child, i) => child.style.setProperty(prop, String(i)))
  })
}

function initReveals() {
  indexChildren('[data-stagger]', ':scope > *', '--si')
  indexChildren('[data-tiles]', '.st', '--ti')
  indexChildren('[data-bars]', '[data-bar]', '--bi')
  onceInView(all('[data-split], [data-reveal], [data-stagger], [data-tiles], [data-bars]'), (el) => el.classList.add('is-in'))
}

function parseCount(text: string) {
  const match = text.trim().match(/^(\D*?)(\d+(?:\.\d+)?)(\D*)$/)
  if (!match) return null
  const [, prefix, digits, suffix] = match
  return { prefix, suffix, target: Number(digits), decimals: digits.split('.')[1]?.length ?? 0 }
}

function initCounters() {
  const counters = all('[data-count]').flatMap((el) => {
    const parsed = parseCount(el.textContent ?? '')
    if (!parsed || parsed.target === 0) return []
    const render = (value: number) => {
      el.textContent = `${parsed.prefix}${value.toFixed(parsed.decimals)}${parsed.suffix}`
    }
    render(0)
    return [{ el, parsed, render }]
  })

  onceInView(
    counters.map((c) => c.el),
    (el) => {
      const counter = counters.find((c) => c.el === el)
      if (!counter) return
      const start = performance.now()
      const duration = 1400
      const tick = (now: number) => {
        const t = clamp((now - start) / duration, 0, 1)
        counter.render(counter.parsed.target * easeOutExpo(t))
        if (t < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    },
  )
}

function initTilt() {
  all('[data-tilt]').forEach((el) => {
    const max = Number(el.dataset.tilt || 5)
    el.addEventListener('pointermove', (event) => {
      const rect = el.getBoundingClientRect()
      const x = (event.clientX - rect.left) / rect.width - 0.5
      const y = (event.clientY - rect.top) / rect.height - 0.5
      el.style.setProperty('--rx', `${(-y * max).toFixed(2)}deg`)
      el.style.setProperty('--ry', `${(x * max).toFixed(2)}deg`)
    })
    el.addEventListener('pointerleave', () => {
      el.style.setProperty('--rx', '0deg')
      el.style.setProperty('--ry', '0deg')
    })
  })
}

function initMagnetic() {
  all('[data-magnetic]').forEach((el) => {
    const strength = Number(el.dataset.magnetic || 0.3)
    el.addEventListener('pointermove', (event) => {
      const rect = el.getBoundingClientRect()
      const x = (event.clientX - rect.left - rect.width / 2) * strength
      const y = (event.clientY - rect.top - rect.height / 2) * strength
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    })
    el.addEventListener('pointerleave', () => {
      el.style.transform = ''
    })
  })
}

function initSpotlight() {
  all('[data-spotlight]').forEach((group) => {
    const targets = group.dataset.spotlight === 'self' ? [group] : all(':scope > *', group)
    group.addEventListener('pointermove', (event) => {
      targets.forEach((target) => {
        const rect = target.getBoundingClientRect()
        target.style.setProperty('--mx', `${event.clientX - rect.left}px`)
        target.style.setProperty('--my', `${event.clientY - rect.top}px`)
      })
    })
  })
}

function initSteps() {
  all('[data-steps]').forEach((list) => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => entry.target.classList.toggle('is-active', entry.isIntersecting))
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    all(':scope > li', list).forEach((li) => io.observe(li))
  })
}

interface Marquee {
  root: HTMLElement
  track: HTMLElement
  offset: number
  skew: number
  visible: boolean
}

function initScrollLoop() {
  const progress = document.querySelector<HTMLElement>('[data-progress]')
  const header = document.querySelector<HTMLElement>('[data-header]')
  const parallax = all('[data-parallax]')
  const scrubs = all('[data-scrub]')
  const marquees: Marquee[] = all('[data-marquee]').flatMap((root) => {
    const track = root.querySelector<HTMLElement>('[data-marquee-track]')
    return track ? [{ root, track, offset: 0, skew: 0, visible: false }] : []
  })

  let lastY = window.scrollY
  let velocity = 0
  let headerAnchor = lastY
  let running = false
  let idleFrames = 0

  const marqueeIO = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const m = marquees.find((item) => item.root === entry.target)
      if (m) m.visible = entry.isIntersecting
    })
    start()
  })
  marquees.forEach((m) => marqueeIO.observe(m.root))

  const updateScroll = (y: number) => {
    const vh = window.innerHeight
    const max = document.documentElement.scrollHeight - vh
    if (progress) progress.style.transform = `scaleX(${max > 0 ? clamp(y / max, 0, 1) : 0})`

    if (header) {
      header.classList.toggle('is-scrolled', y > 8)
      const dy = y - headerAnchor
      if (y < 120 || dy < -40) {
        header.classList.remove('is-hidden')
        headerAnchor = y
      } else if (dy > 40) {
        header.classList.add('is-hidden')
        headerAnchor = y
      }
    }

    parallax.forEach((el) => {
      const rect = el.getBoundingClientRect()
      if (rect.bottom < -vh || rect.top > vh * 2) return
      const speed = Number(el.dataset.parallax || 0.1)
      const delta = rect.top + rect.height / 2 - vh / 2
      el.style.setProperty('--py', `${(delta * -speed).toFixed(1)}px`)
    })

    scrubs.forEach((el) => {
      const rect = el.getBoundingClientRect()
      const startLine = vh * Number(el.dataset.scrubStart || 0.85)
      const span = rect.height * Number(el.dataset.scrubSpan || 1)
      el.style.setProperty('--p', clamp((startLine - rect.top) / span, 0, 1).toFixed(4))
    })
  }

  const frame = () => {
    const y = window.scrollY
    const moved = y !== lastY
    velocity = lerp(velocity, y - lastY, 0.2)
    lastY = y
    if (moved) updateScroll(y)

    let marqueeActive = false
    marquees.forEach((m) => {
      if (!m.visible) return
      marqueeActive = true
      const half = m.track.scrollWidth / 2
      m.offset -= 0.6 + Math.abs(velocity) * 0.35
      if (half > 0 && -m.offset >= half) m.offset += half
      m.skew = lerp(m.skew, clamp(velocity * -0.25, -10, 10), 0.12)
      m.track.style.transform = `translate3d(${m.offset.toFixed(2)}px, 0, 0) skewX(${m.skew.toFixed(2)}deg)`
    })

    idleFrames = moved || Math.abs(velocity) > 0.05 ? 0 : idleFrames + 1
    if (marqueeActive || idleFrames < 30) {
      requestAnimationFrame(frame)
    } else {
      running = false
    }
  }

  function start() {
    if (running) return
    running = true
    idleFrames = 0
    requestAnimationFrame(frame)
  }

  updateScroll(lastY)
  window.addEventListener('scroll', start, { passive: true })
  window.addEventListener('resize', () => {
    updateScroll(window.scrollY)
    start()
  })
  start()
}

function initProgressOnly() {
  const progress = document.querySelector<HTMLElement>('[data-progress]')
  if (!progress) return
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    progress.style.transform = `scaleX(${max > 0 ? clamp(window.scrollY / max, 0, 1) : 0})`
  }
  update()
  window.addEventListener('scroll', update, { passive: true })
}

if (reduceMotion) {
  initProgressOnly()
} else {
  initReveals()
  initCounters()
  initSteps()
  initScrollLoop()
  if (finePointer) {
    initTilt()
    initMagnetic()
    initSpotlight()
  }
}
