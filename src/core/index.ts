import { chaveTitulo, coberturaDe, lerRelatorio, mesclarTitulos, type ArquivoRelatorio } from './relatorios'
import type { Cobertura, Titulo } from './tipos'

export * from './tipos'
export { lerCadastros, LAYOUT, TOLERANCIA_PADRAO } from './cadastros'
export { conciliar, fornecedorDoContrato } from './conciliacao'
export { lerRelatorio, mesclarTitulos, chaveTitulo, type ArquivoRelatorio } from './relatorios'

export interface EstadoImportacao {
  titulos: Titulo[]
  coberturas: Cobertura[]
}

export interface ResultadoImportacao extends EstadoImportacao {
  /** removidos: títulos que sumiram de um retrato completo (excluídos no Protheus) */
  processados: { arquivo: string; layout: string; titulos: number; erros: number; removidos: number }[]
  pulados: string[]
  /** Arquivos que não puderam ser lidos — não entram no estado e serão tentados de novo. */
  falhas: { arquivo: string; erro: string }[]
}

/**
 * Incorpora relatórios ao estado acumulado. Arquivos já importados (mesmo hash) são pulados,
 * e títulos repetidos entre relatórios são unificados pela chave do Protheus.
 */
export function importarRelatorios(estado: EstadoImportacao, arquivos: ArquivoRelatorio[], importadoEm: string): ResultadoImportacao {
  const hashes = new Set(estado.coberturas.map((c) => c.hash))
  const coberturas = [...estado.coberturas]
  let titulos = mesclarTitulos(estado.titulos.map(normalizarGuardado), [])
  const processados: ResultadoImportacao['processados'] = []
  const pulados: string[] = []
  const falhas: ResultadoImportacao['falhas'] = []

  // Ordem cronológica: o relatório mais recente prevalece em caso de divergência.
  for (const arq of [...arquivos].sort((a, b) => a.geradoEm.localeCompare(b.geradoEm))) {
    if (hashes.has(arq.hash)) {
      pulados.push(arq.nome)
      continue
    }
    const lido = lerRelatorio(arq)
    if (lido.layout === 'desconhecido') {
      falhas.push({ arquivo: arq.nome, erro: lido.erros[0] ?? 'erro desconhecido' })
      continue
    }
    titulos = mesclarTitulos(titulos.values(), lido.titulos)
    let removidos = 0
    if (lido.completo && lido.emissaoIni && lido.emissaoFim) {
      // Retrato completo do período: o que é mais antigo que ele, está no período e não aparece, foi excluído no Protheus.
      const presentes = new Set(lido.titulos.map((t) => t.chave))
      for (const [chave, t] of titulos) {
        const noPeriodo = !!t.emissao && t.emissao >= lido.emissaoIni && t.emissao <= lido.emissaoFim
        if (noPeriodo && !presentes.has(chave) && t.origem.geradoEm < arq.geradoEm) {
          titulos.delete(chave)
          removidos++
        }
      }
    }
    coberturas.push(coberturaDe(arq, lido, importadoEm))
    hashes.add(arq.hash)
    processados.push({ arquivo: arq.nome, layout: lido.layout, titulos: lido.titulos.length, erros: lido.erros.length, removidos })
  }
  return { titulos: [...titulos.values()], coberturas, processados, pulados, falhas }
}

/**
 * Títulos guardados antes da view usavam a filial com descrição ('010100001-FUNPAR ADM').
 * Normaliza para o código puro, para que os mesmos títulos vindos da view não dupliquem.
 */
function normalizarGuardado(t: Titulo): Titulo {
  const filial = t.filial.split('-')[0]!.trim()
  if (filial === t.filial) return t
  const n = { ...t, filial }
  return { ...n, chave: chaveTitulo(n) }
}
