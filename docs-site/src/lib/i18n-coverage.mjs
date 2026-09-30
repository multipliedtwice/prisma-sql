import ar from '../i18n/ar.json' with { type: 'json' }
import bn from '../i18n/bn.json' with { type: 'json' }
import en from '../i18n/en.json' with { type: 'json' }
import es from '../i18n/es.json' with { type: 'json' }
import fr from '../i18n/fr.json' with { type: 'json' }
import hi from '../i18n/hi.json' with { type: 'json' }
import pt from '../i18n/pt.json' with { type: 'json' }
import ru from '../i18n/ru.json' with { type: 'json' }
import ur from '../i18n/ur.json' with { type: 'json' }
import zh from '../i18n/zh.json' with { type: 'json' }

export const BASE = '/prisma-sql'
export const LOCALES = ['en', 'es', 'fr', 'pt', 'hi', 'bn', 'ar', 'ur', 'ru', 'zh']

const DICTIONARIES = { ar, bn, en, es, fr, hi, pt, ru, ur, zh }
const SECTIONS = { home: null, testing: 'testing', 'sql-prevention': 'sqlPrevention' }
const CODE_KEY = /code|attack|files|statement|filename/i
const MIN_TRANSLATED = 0.6

function strings(value, path = '') {
  if (typeof value === 'string') return value.length > 12 && !CODE_KEY.test(path) ? [[path, value]] : []
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`))
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`))
  return []
}

function translatedShare(locale, key) {
  if (locale === 'en' || !key) return 1
  const source = strings(en[key])
  const target = new Map(strings(DICTIONARIES[locale][key]))
  if (!source.length) return 1
  return 1 - source.filter(([path, text]) => target.get(path) === text).length / source.length
}

export function translatedLocales(page) {
  if (!(page in SECTIONS)) return ['en']
  return LOCALES.filter((locale) => translatedShare(locale, SECTIONS[page]) >= MIN_TRANSLATED)
}

export function pagePath(page, locale) {
  const prefix = locale === 'en' ? `${BASE}/` : `${BASE}/${locale}/`
  return page === 'home' ? prefix : `${prefix}${page}/`
}

export function pageFromPath(pathname) {
  const rest = pathname.replace(/^\/prisma-sql\/?/, '').split('/').filter(Boolean)
  const locale = LOCALES.includes(rest[0]) ? rest.shift() : 'en'
  const page = rest.length === 0 ? 'home' : rest.join('/')
  return { locale, page }
}

export function isTranslation(pathname) {
  const { locale, page } = pageFromPath(pathname)
  return translatedLocales(page).includes(locale)
}
