import * as XLSX from 'xlsx'

/** Texto limpo ou null (trata espaços do Protheus e células vazias). */
export function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).replace(/\s+/g, ' ').trim()
  return s === '' ? null : s
}

/** Normaliza cabeçalhos/chaves: minúsculas, sem acento, só letras e números. */
export function normalizarChave(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function somenteDigitos(v: unknown): string | null {
  const s = texto(v)
  if (!s) return null
  const d = s.replace(/\D/g, '')
  return d === '' ? null : d
}

/** CNPJ/CPF só com dígitos; zeros (estrangeiros no Protheus) viram null. */
export function documento(v: unknown): string | null {
  const d = somenteDigitos(v)
  if (!d || /^0+$/.test(d)) return null
  return d
}

/** '0000630056-0000', '00006300560000' ou 630056 → '630056' */
export function protocolo(v: unknown): string | null {
  const s = texto(v)
  if (!s) return null
  let principal = (s.split('-')[0] ?? '').replace(/\D/g, '')
  // A view traz o protocolo sem o hífen: '00006171740000' = '0000617174' + sufixo '0000'
  if (!s.includes('-') && principal.length === 14) principal = principal.slice(0, 10)
  const d = principal.replace(/^0+/, '')
  return d === '' ? null : d
}

export function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = String(v).trim().replace(/[R$\s%]/g, '')
  if (s === '') return null
  // "1.234,56" → 1234.56 ; "1234.56" mantém
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0')
}

function isoValida(a: number, m: number, d: number): string | null {
  if (a < 1900 || a > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${a}-${pad(m)}-${pad(d)}`
}

/** Converte serial do Excel, Date, 'dd/mm/aaaa' ou 'aaaa-mm-dd' para 'AAAA-MM-DD'. */
export function dataISO(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') {
    const p = XLSX.SSF.parse_date_code(v)
    return p ? isoValida(p.y, p.m, p.d) : null
  }
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null
    return isoValida(v.getFullYear(), v.getMonth() + 1, v.getDate())
  }
  const s = String(v).trim()
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s)
  if (m) {
    let a = Number(m[3])
    if (a < 100) a += 2000
    return isoValida(a, Number(m[2]), Number(m[1]))
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return isoValida(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s)
  if (m) return isoValida(Number(m[1]), Number(m[2]), Number(m[3]))
  return null
}

export function competenciaDe(iso: string | null): string | null {
  return iso ? iso.slice(0, 7) : null
}

export function competenciaValida(v: unknown): string | null {
  const s = texto(v)
  if (!s) return null
  let m = /^(\d{4})-(\d{1,2})$/.exec(s)
  if (m) return `${m[1]}-${pad(Number(m[2]))}`
  m = /^(\d{1,2})\/(\d{4})$/.exec(s)
  if (m) return `${m[2]}-${pad(Number(m[1]))}`
  const iso = dataISO(v)
  return iso ? iso.slice(0, 7) : null
}

export function somarMeses(competencia: string, n: number): string {
  const [a, m] = competencia.split('-').map(Number) as [number, number]
  const total = a * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

export function inicioCompetencia(c: string): string {
  return `${c}-01`
}

export function fimCompetencia(c: string): string {
  const [a, m] = c.split('-').map(Number) as [number, number]
  const ultimo = new Date(a, m, 0).getDate()
  return `${c}-${pad(ultimo)}`
}

export function hojeISO(agora: Date = new Date()): string {
  return isoValida(agora.getFullYear(), agora.getMonth() + 1, agora.getDate())!
}

export function diasEntre(deISO: string, ateISO: string): number {
  const [a1, m1, d1] = deISO.split('-').map(Number) as [number, number, number]
  const [a2, m2, d2] = ateISO.split('-').map(Number) as [number, number, number]
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000)
}

export function simNao(v: unknown): boolean | null {
  const s = texto(v)
  if (!s) return null
  const n = normalizarChave(s)
  if (['s', 'sim', 'true', '1', 'x'].includes(n)) return true
  if (['n', 'nao', 'false', '0'].includes(n)) return false
  return null
}

/** Códigos do Protheus: preserva zeros à esquerda; números do Excel são completados até `largura`. */
export function codigo(v: unknown, largura = 6): string | null {
  if (typeof v === 'number') return String(v).padStart(largura, '0')
  return texto(v)
}
