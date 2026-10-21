import { ref, type Ref } from 'vue'

type Valor = string | number | null | undefined

/** Compara textos (pt-BR, sem diferenciar acento/caixa) e números; vazios vão sempre para o fim. */
export function comparar(a: Valor, b: Valor): number {
  const va = a === '' ? null : a
  const vb = b === '' ? null : b
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  if (typeof va === 'number' && typeof vb === 'number') return va - vb
  return String(va).localeCompare(String(vb), 'pt-BR', { sensitivity: 'base', numeric: true })
}

/**
 * Ordenação por coluna: clicar no cabeçalho ordena; clicar de novo inverte (crescente ↔ decrescente).
 * `chave` diz como obter o valor de cada coluna; vazios ficam no fim nos dois sentidos.
 */
export function useOrdenacao<T, C extends string>(chave: (item: T, col: C) => Valor, colInicial: C, descInicial = false) {
  const ordem = ref({ col: colInicial, desc: descInicial }) as Ref<{ col: C; desc: boolean }>

  function ordenar(col: C) {
    ordem.value = ordem.value.col === col ? { col, desc: !ordem.value.desc } : { col, desc: false }
  }

  const seta = (col: C) => (ordem.value.col === col ? (ordem.value.desc ? ' ▼' : ' ▲') : '')

  function aplicar(itens: T[]): T[] {
    const { col, desc } = ordem.value
    return [...itens].sort((a, b) => {
      const va = chave(a, col)
      const vb = chave(b, col)
      // Vazios sempre no fim, independentemente do sentido.
      if (va == null || va === '') return vb == null || vb === '' ? 0 : 1
      if (vb == null || vb === '') return -1
      const c = comparar(va, vb)
      return desc ? -c : c
    })
  }

  return { ordem, ordenar, seta, aplicar }
}

/** Filtro de período sobre datas ISO ('AAAA-MM-DD'); sem data, o item só passa quando não há filtro. */
export function noPeriodo(dataISO: string | null | undefined, de: string, ate: string): boolean {
  if (!de && !ate) return true
  if (!dataISO) return false
  return (!de || dataISO >= de) && (!ate || dataISO <= ate)
}

/** Nome para ordenar: sem o CNPJ de MEI que o Protheus põe na frente ("12.345.678 FULANO" → "FULANO"). */
export const nomeParaOrdenar = (nome: string | null | undefined) => (nome ?? '').replace(/^[\d.\-/\s]+/, '')
