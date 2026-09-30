const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const all = (selector: string, root: ParentNode = document) => Array.from(root.querySelectorAll<HTMLElement>(selector))

function indexChildren(selector: string, childSelector: string, prop: string) {
  all(selector).forEach((group) => {
    all(childSelector, group).forEach((child, i) => child.style.setProperty(prop, String(i)))
  })
}

function initDataReveals() {
  indexChildren('[data-tiles]', '.st', '--ti')
  indexChildren('[data-bars]', '[data-bar]', '--bi')
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        io.unobserve(entry.target)
        entry.target.classList.add('is-in')
      })
    },
    { rootMargin: '0px 0px -12% 0px' },
  )
  all('[data-tiles], [data-bars]').forEach((el) => io.observe(el))
}

function initSteps() {
  const sections = all('[data-steps-section]').map((section) => ({
    section,
    steps: all('[data-steps] > li', section),
    panels: all('[data-step-panel]', section),
    active: -1,
  }))
  if (!sections.length) return () => {}

  const activate = (entry: (typeof sections)[number], index: number) => {
    if (entry.active === index) return
    entry.active = index
    entry.steps.forEach((li, i) => li.classList.toggle('is-active', i === index))
    entry.panels.forEach((panel) => {
      const on = Number(panel.dataset.stepPanel) === index
      panel.classList.toggle('is-active', on)
      if (on) panel.removeAttribute('aria-hidden')
      else panel.setAttribute('aria-hidden', 'true')
    })
  }

  sections.forEach((entry) => activate(entry, 0))

  return () => {
    const center = window.innerHeight / 2
    sections.forEach((entry) => {
      let best = entry.active
      let bestDistance = Infinity
      entry.steps.forEach((li, i) => {
        const rect = li.getBoundingClientRect()
        const distance = rect.top <= center && rect.bottom >= center ? 0 : Math.min(Math.abs(rect.top - center), Math.abs(rect.bottom - center))
        if (distance < bestDistance) {
          bestDistance = distance
          best = i
        }
      })
      activate(entry, best)
    })
  }
}

function initScroll(onScroll: () => void) {
  const header = document.querySelector<HTMLElement>('[data-header]')
  const scrubs = all('[data-scrub]')
  let headerAnchor = window.scrollY
  let queued = false

  const update = () => {
    queued = false
    const y = window.scrollY
    const vh = window.innerHeight

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
      document.documentElement.classList.toggle('header-hidden', header.classList.contains('is-hidden'))
    }

    scrubs.forEach((el) => {
      const rect = el.getBoundingClientRect()
      const startLine = vh * Number(el.dataset.scrubStart || 0.85)
      el.style.setProperty('--p', clamp((startLine - rect.top) / rect.height, 0, 1).toFixed(4))
    })

    onScroll()
  }

  const queue = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(update)
  }

  update()
  window.addEventListener('scroll', queue, { passive: true })
  window.addEventListener('resize', queue)
}

initScroll(initSteps())
if (!reduceMotion) initDataReveals()
