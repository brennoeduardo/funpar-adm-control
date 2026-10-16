import type { Situacao, Vigencia } from '@core/situacao'

export const ESTILO_SITUACAO: Record<Situacao, { cor: string; fundo: string; simbolo: string }> = {
  pago: { cor: 'var(--s-pago)', fundo: 'var(--s-pago-bg)', simbolo: '✓' },
  lancado: { cor: 'var(--s-lancado)', fundo: 'var(--s-lancado-bg)', simbolo: 'L' },
  vencido: { cor: 'var(--s-vencido)', fundo: 'var(--s-vencido-bg)', simbolo: '!' },
  nao_lancado: { cor: 'var(--s-naolancado)', fundo: 'var(--s-naolancado-bg)', simbolo: '✗' },
  sem_registro: { cor: 'var(--s-sem)', fundo: 'var(--s-sem-bg)', simbolo: '?' },
  fora_cobertura: { cor: 'var(--s-fora)', fundo: 'var(--s-fora-bg)', simbolo: '·' },
  nao_previsto: { cor: 'var(--s-nao)', fundo: 'var(--s-nao-bg)', simbolo: '' },
  futuro: { cor: 'var(--s-nao)', fundo: 'var(--s-nao-bg)', simbolo: '' },
}

/** Ordem de exibição na legenda e nos resumos */
export const ORDEM_SITUACAO: Situacao[] = ['pago', 'lancado', 'vencido', 'nao_lancado', 'sem_registro', 'fora_cobertura', 'nao_previsto', 'futuro']

export const ESTILO_VIGENCIA: Record<Vigencia, string> = {
  vigente: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  vencendo: 'bg-amber-50 text-amber-800 border-amber-200',
  vencido: 'bg-red-50 text-red-700 border-red-200',
  a_iniciar: 'bg-sky-50 text-sky-700 border-sky-200',
  sem_data: 'bg-slate-50 text-slate-600 border-slate-200',
  inativo: 'bg-slate-50 text-slate-400 border-slate-200',
}
