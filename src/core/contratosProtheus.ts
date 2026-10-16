import { encontrarTabela, lerPasta } from './planilha'
import type { ContratoProtheus, ResumoPagamentos, Titulo } from './tipos'
import { codigo, competenciaDe, dataISO, documento, numero, texto } from './util'

/**
 * Lê o CSV da view de contratos (uma linha por contrato × produto × centro de custo)
 * e agrupa em uma entrada por contrato. O valor médio se repete nas linhas: é do contrato, não se soma.
 */
export function lerContratosProtheus(bytes: Uint8Array, nomeArquivo: string): { contratos: ContratoProtheus[]; erros: string[] } {
  let pasta
  try {
    pasta = lerPasta(bytes, nomeArquivo)
  } catch (e) {
    return { contratos: [], erros: [`Não foi possível abrir ${nomeArquivo}: ${(e as Error).message}`] }
  }
  const tabela = encontrarTabela(pasta, ['CONTRATO', 'COD. FORNECEDOR', 'DATA FIM'])
  if (!tabela) return { contratos: [], erros: [`${nomeArquivo}: colunas CONTRATO, COD. FORNECEDOR e DATA FIM não encontradas`] }

  const mapa = new Map<string, ContratoProtheus>()
  for (const l of tabela.linhas) {
    const numeroCt = texto(l['contrato'])
    const codFornecedor = codigo(l['codfornecedor'])
    if (!numeroCt || !codFornecedor) continue
    const chave = `${numeroCt}|${codFornecedor}`
    let c = mapa.get(chave)
    if (!c) {
      c = {
        contrato: numeroCt,
        codFornecedor,
        cnpj: documento(l['cpfcnpj']),
        fornecedor: texto(l['nomefornecedor']) ?? codFornecedor,
        processo: texto(l['processointerno']),
        inicio: dataISO(texto(l['datainicio'])),
        fim: dataISO(texto(l['datafim'])),
        // Textos de memo do Protheus trazem quebras como "\13\10" literal.
        objeto: texto(String(l['objeto'] ?? '').replace(/\\13\\10/g, ' ')),
        produtos: [],
        centrosCusto: [],
        centroNegocio: texto(l['descricentronegocio']),
        natureza: texto(l['codnatureza']),
        descNatureza: texto(l['descrinatureza']),
        tipo: texto(l['tipocontrato']),
        tipoVencimento: texto(l['tipovencimento'])?.toUpperCase() ?? null,
        valorMedio: numero(l['valormedio']),
      }
      mapa.set(chave, c)
    }
    const prod = texto(l['codproduto'])
    if (prod && !c.produtos.some((p) => p.codigo === prod)) c.produtos.push({ codigo: prod, descricao: texto(l['descriproduto']) })
    const cc = texto(l['codcentrocusto'])
    if (cc && !c.centrosCusto.some((x) => x.codigo === cc)) c.centrosCusto.push({ codigo: cc, descricao: texto(l['descricentrocusto']) })
  }
  return { contratos: [...mapa.values()], erros: [] }
}

/**
 * Resumo dos pagamentos de cada fornecedor a partir de todos os títulos do Contas a Pagar.
 * Não separa por contrato: o título não traz o número do contrato.
 */
export function resumirPagamentos(titulos: Titulo[], codigos: Set<string>, hoje: string): Map<string, ResumoPagamentos> {
  const ano = hoje.slice(0, 4)
  const porFornecedor = new Map<string, Titulo[]>()
  for (const t of titulos) {
    if (!codigos.has(t.fornecedor)) continue
    porFornecedor.set(t.fornecedor, [...(porFornecedor.get(t.fornecedor) ?? []), t])
  }
  const resumo = new Map<string, ResumoPagamentos>()
  for (const [cod, ts] of porFornecedor) {
    const pagos = ts.filter((t) => t.baixa && t.saldo <= 0)
    const doAno = pagos.filter((t) => t.baixa!.startsWith(ano))
    const ultimo = [...pagos].sort((a, b) => b.baixa!.localeCompare(a.baixa!))[0]
    // Média por mês de pagamento, nos 3 meses mais recentes que tiveram pagamento.
    const porMes = new Map<string, number>()
    for (const t of pagos) porMes.set(competenciaDe(t.baixa)!, (porMes.get(competenciaDe(t.baixa)!) ?? 0) + t.valor)
    const meses = [...porMes.keys()].sort().slice(-3)
    const aPagar = ts.filter((t) => t.saldo > 0 || !t.baixa)
    resumo.set(cod, {
      pagoNoAno: arred(doAno.reduce((s, t) => s + t.valor, 0)),
      titulosNoAno: doAno.length,
      ultimoPagamento: ultimo?.baixa ?? null,
      ultimoValor: ultimo?.valor ?? null,
      mediaRecente: meses.length ? arred(meses.reduce((s, m) => s + porMes.get(m)!, 0) / meses.length) : null,
      aPagar: aPagar.length,
      valorAPagar: arred(aPagar.reduce((s, t) => s + (t.saldo || t.valor), 0)),
    })
  }
  return resumo
}

const arred = (v: number) => Math.round(v * 100) / 100
