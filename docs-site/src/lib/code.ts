export type CodeLang = 'ts' | 'sql' | 'bash' | 'prisma'

const KEYWORDS: Record<CodeLang, Set<string>> = {
  ts: new Set([
    'import', 'from', 'const', 'await', 'async', 'export', 'type', 'as',
    'new', 'return', 'typeof', 'true', 'false',
  ]),
  sql: new Set([
    'SELECT', 'FROM', 'WHERE', 'AS', 'AND', 'OR', 'JOIN', 'LEFT', 'ON',
    'ORDER', 'BY', 'LIMIT', 'OFFSET', 'GROUP', 'IN', 'NOT', 'NULL',
  ]),
  bash: new Set(['npm', 'npx', 'install']),
  prisma: new Set(['generator', 'model', 'datasource', 'provider']),
}

const TOKEN =
  /(\/\/[^\n]*|--[^\n]*|#[^\n]*|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\$\d+|\?|[A-Za-z_$][\w$]*|\s+|[^\sA-Za-z_$'"]+)/g

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function classify(token: string, next: string, lang: CodeLang): string | null {
  if (token.startsWith('//') || (lang === 'bash' && token.startsWith('#')) || (lang === 'sql' && token.startsWith('--'))) return 'tok-punc'
  if (token.startsWith("'")) return 'tok-str'
  if (token.startsWith('"')) return lang === 'sql' ? null : 'tok-str'
  if (lang === 'sql' && (/^\$\d+$/.test(token) || token === '?')) return 'tok-param'
  if (KEYWORDS[lang].has(token)) return 'tok-kw'
  if (/^[A-Za-z_$][\w$]*$/.test(token) && next.startsWith('(')) return 'tok-fn'
  if (lang === 'ts' && /^[A-Za-z_$][\w$]*$/.test(token) && next.startsWith(':')) return 'tok-key'
  return null
}

export function highlightLines(code: string, lang: CodeLang): string[] {
  return code.split('\n').map((line) => {
    const tokens = line.match(TOKEN) ?? []
    return tokens
      .map((token, i) => {
        const next = tokens.slice(i + 1).join('').trimStart()
        const cls = classify(token, next, lang)
        const html = escapeHtml(token)
        return cls ? `<span class="${cls}">${html}</span>` : html
      })
      .join('')
  })
}

export function highlight(code: string, lang: CodeLang): string {
  return highlightLines(code, lang).join('\n')
}

export const QUERY_SNIPPET = `const users = await prisma.user.findMany({
  where: { status: 'ACTIVE' },
  include: { posts: true },
})`

export const GENERATED_SQL: Record<'postgres' | 'sqlite', { sql: string; params: string }> = {
  postgres: {
    sql: `SELECT user_t.id, user_t.email, user_t.status,
  COALESCE((
    SELECT COALESCE(json_agg(json_build_object(
      'id', posts_0.id,
      'title', posts_0.title,
      'authorId', posts_0."authorId"
    )), '[]'::json)
    FROM "public"."Post" posts_0
    WHERE posts_0."authorId" = user_t.id
  ), '[]'::json) AS posts
FROM "public"."User" user_t
WHERE user_t.status = $1`,
    params: `["ACTIVE"]`,
  },
  sqlite: {
    sql: `SELECT user_t.id, user_t.email, user_t.status,
  COALESCE((
    SELECT COALESCE(json_group_array(row), json('[]'))
    FROM (
      SELECT json_object(
        'id', posts_0.id,
        'title', posts_0.title,
        'authorId', posts_0."authorId"
      ) AS row
      FROM "Post" posts_0
      WHERE posts_0."authorId" = user_t.id
    ) AS posts_row_1
  ), json('[]')) AS posts
FROM "User" user_t
WHERE user_t.status = ?`,
    params: `["ACTIVE"]`,
  },
}

export const INSTALL_SNIPPET = `# PostgreSQL
npm install prisma-sql postgres

# SQLite
npm install prisma-sql better-sqlite3`

export const GENERATOR_SNIPPET = `generator client {
  provider = "prisma-client"
}

generator sql {
  provider = "prisma-sql-generator"
}`

export const SETUP_SNIPPET = `import { PrismaClient } from '@prisma/client'
import { speedExtension, type SpeedClient } from './generated/sql'
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!)
const basePrisma = new PrismaClient()

export const prisma = basePrisma.$extends(
  speedExtension({ postgres: sql }),
) as SpeedClient<typeof basePrisma>`

export const STEP_SNIPPETS: { file: string; lang: CodeLang; code: string }[] = [
  {
    file: 'generated/sql, excerpt',
    lang: 'ts',
    code: `query: {
  $allModels: {
    async $allOperations({ model, operation, args, query }) {
      if (!ACCELERATED_METHODS.has(operation)) {
        return query(args)
      }
      return executeAccelerated(model, operation, args, query)
    },
  },
}`,
  },
  {
    file: 'SQL for PostgreSQL',
    lang: 'sql',
    code: `${GENERATED_SQL.postgres.sql}

-- params ${GENERATED_SQL.postgres.params}`,
  },
  {
    file: 'generated/sql, excerpt',
    lang: 'ts',
    code: `if (DIALECT === 'postgres') {
  await client.unsafe(sql, normalizedParams).forEach((row) => {
    results.push(row)
  })
  return results
}

const stmt = getOrPrepareStatement(client, sql)
return stmt.all(...normalizedParams)`,
  },
  {
    file: 'users.ts',
    lang: 'ts',
    code: `${QUERY_SNIPPET}

users[0].email
users[0].posts[0].title`,
  },
]
