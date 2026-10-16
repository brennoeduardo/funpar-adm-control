const moedaFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const numeroFmt = new Intl.NumberFormat('pt-BR')
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export const moeda = (v: number | null | undefined) => (v === null || v === undefined ? '—' : moedaFmt.format(v))
export const inteiro = (v: number) => numeroFmt.format(v)

/** 'AAAA-MM-DD' → 'dd/mm/aaaa' */
export const data = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—')

export function dataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/** '2026-09' → 'set/26' */
export function compCurta(c: string | null | undefined): string {
  if (!c) return '—'
  const [a, m] = c.split('-')
  return `${MESES[Number(m) - 1]}/${a!.slice(2)}`
}

/** '2026-09' → 'setembro de 2026' */
export function compLonga(c: string | null | undefined): string {
  if (!c) return '—'
  const [a, m] = c.split('-')
  return `${MESES_LONGOS[Number(m) - 1]} de ${a}`
}

export function mesCurto(c: string): string {
  return MESES[Number(c.slice(5, 7)) - 1] ?? c
}

export function cnpj(d: string | null | undefined): string {
  if (!d) return '—'
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return d
}

/** Busca sem acento e sem diferenciar maiúsculas. */
export function contemTexto(alvo: (string | null | undefined)[], termo: string): boolean {
  const t = normal(termo)
  if (!t) return true
  return alvo.some((a) => a && normal(a).includes(t))
}

function normal(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}
