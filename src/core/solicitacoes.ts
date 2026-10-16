import { lerPasta, encontrarTabela } from './planilha'
import type { Fornecedor, Solicitacao } from './tipos'
import { dataISO, normalizarChave, numero, protocolo, texto } from './util'

export const ORIGEM_ATAS = 'ATAS E CONTRATOS'
export const ORIGEM_COMPRAS = 'FORMULÁRIO DE COMPRAS'

/**
 * Lê o CSV/Excel da view de solicitações abertas. É um retrato: substitui o anterior a cada extração.
 */
export function lerSolicitacoes(bytes: Uint8Array, nomeArquivo: string): { itens: Solicitacao[]; erros: string[] } {
  let pasta
  try {
    pasta = lerPasta(bytes, nomeArquivo)
  } catch (e) {
    return { itens: [], erros: [`Não foi possível abrir ${nomeArquivo}: ${(e as Error).message}`] }
  }
  const tabela = encontrarTabela(pasta, ['ORIGEM', 'PROTOCOLO', 'DESC_STATUS'])
  if (!tabela) return { itens: [], erros: [`${nomeArquivo}: colunas ORIGEM, PROTOCOLO e DESC_STATUS não encontradas`] }
  const itens: Solicitacao[] = []
  for (const l of tabela.linhas) {
    const origem = texto(l['origem'])
    if (!origem) continue
    itens.push({
      origem: origem.toUpperCase(),
      protocolo: protocolo(l['protocolo']),
      solicitante: texto(l['solicitante']),
      fornecedor: texto(l['fornecbeneficiario']) ?? '(sem fornecedor)',
      codFornecedor: null,
      data: dataISO(texto(l['data'])),
      descricao: texto(l['descri']),
      valor: numero(l['valor']) ?? 0,
      status: texto(l['descstatus'])?.toUpperCase() ?? '(sem status)',
      centroCusto: texto(l['centrodecusto']),
      contaContabil: texto(l['contacontabil']),
      descContaContabil: texto(l['desccontacontabil']),
    })
  }
  return { itens, erros: [] }
}

/** Nome comparável: sem acento, sem CNPJ/CPF no começo ("12.345.678 FULANO"), sem sufixos societários. */
function nomeComparavel(nome: string): string {
  return normalizarChave(
    nome
      .replace(/^[\d.\-/\s]+/, '')
      .replace(/\b\d{11}\b|\b\d{14}\b/g, '')
      .replace(/\b(LTDA|EIRELI|ME|EPP|S\.?A\.?|S\/A|SOCIEDADE INDIVIDUAL DE ADVOCACIA)\b\.?/gi, ''),
  )
}

/**
 * A view não traz código nem CNPJ do fornecedor: liga ao cadastro ADM pelo nome
 * (razão social ou nome de exibição, ignorando prefixos de CNPJ e sufixos como LTDA).
 */
export function vincularFornecedores(itens: Solicitacao[], fornecedores: Fornecedor[]): Solicitacao[] {
  const indice = new Map<string, string>()
  for (const f of fornecedores) {
    for (const n of [f.razaoSocial, f.nome]) {
      const k = nomeComparavel(n)
      if (k.length >= 4 && !indice.has(k)) indice.set(k, f.codigo)
    }
  }
  return itens.map((s) => {
    const k = nomeComparavel(s.fornecedor)
    let cod = indice.get(k) ?? null
    if (!cod && k.length >= 8) {
      // Nome truncado ou com complemento: aceita quando um contém o outro.
      for (const [nome, c] of indice) {
        if (nome.length >= 8 && (k.startsWith(nome) || nome.startsWith(k))) {
          cod = c
          break
        }
      }
    }
    return { ...s, codFornecedor: cod }
  })
}
