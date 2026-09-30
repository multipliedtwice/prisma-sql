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
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => entry.target.classList.toggle('is-active', entry.isIntersecting))
    },
    { rootMargin: '-45% 0px -45% 0px' },
  )
  all('[data-steps] > li').forEach((li) => io.observe(li))
}

function initScroll() {
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
    }

    scrubs.forEach((el) => {
      const rect = el.getBoundingClientRect()
      const startLine = vh * Number(el.dataset.scrubStart || 0.85)
      el.style.setProperty('--p', clamp((startLine - rect.top) / rect.height, 0, 1).toFixed(4))
    })
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

initScroll()
if (!reduceMotion) {
  initDataReveals()
  initSteps()
}
