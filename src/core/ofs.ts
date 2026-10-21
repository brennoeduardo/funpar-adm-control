import { encontrarTabela, lerPasta } from './planilha'
import { vincularFornecedores } from './solicitacoes'
import type { ContratoProtheus, Fornecedor, ItemOF } from './tipos'
import { dataISO, numero, protocolo, texto } from './util'

/** O Protheus grava data vazia como 01/01/1900. */
function dataOF(v: unknown): string | null {
  const d = dataISO(texto(v))
  return d && d > '1900-01-01' ? d : null
}

/** Lê o CSV da view de OFs abertas (uma linha por item). É um retrato: substitui o anterior a cada extração. */
export function lerOFs(bytes: Uint8Array, nomeArquivo: string): { itens: ItemOF[]; erros: string[] } {
  let pasta
  try {
    pasta = lerPasta(bytes, nomeArquivo)
  } catch (e) {
    return { itens: [], erros: [`Não foi possível abrir ${nomeArquivo}: ${(e as Error).message}`] }
  }
  const tabela = encontrarTabela(pasta, ['PEDIDO/OF', 'ORIGEM', 'DESC_STATUS'])
  if (!tabela) return { itens: [], erros: [`${nomeArquivo}: colunas PEDIDO/OF, ORIGEM e DESC_STATUS não encontradas`] }
  const itens: ItemOF[] = []
  for (const l of tabela.linhas) {
    const pedido = texto(l['pedidoof'])
    const prot = protocolo(l['protocolo'])
    // Sem nº de OF: solicitação ainda em aprovação (OF a emitir). Mantém se houver protocolo para agrupar.
    if (!pedido && !prot) continue
    itens.push({
      pedido,
      origem: texto(l['origem'])?.toUpperCase() ?? '',
      solicitante: texto(l['solicitante']),
      // A view grafa a coluna como "FORNEC_BENEFECIARIO"; aceita também a grafia correta.
      fornecedor: texto(l['fornecbenefeciario']) ?? texto(l['fornecbeneficiario']) ?? '(sem fornecedor)',
      codFornecedor: null,
      dataSolicitacao: dataOF(l['data']),
      emissao: dataOF(l['dtemissaoof']),
      processo: texto(l['procinterno']),
      contrato: texto(l['contrato']),
      modalidade: texto(l['modalidade']),
      protocolo: prot,
      descricao: texto(l['descri']),
      qtdSolicitada: numero(l['quantsolicitada']) ?? 0,
      qtdEntregue: numero(l['quantentregue']) ?? 0,
      valorUnitario: numero(l['valorunit']) ?? 0,
      valorTotal: numero(l['valortotal']) ?? 0,
      status: texto(l['descstatus'])?.toUpperCase() ?? '(sem status)',
      centroCusto: texto(l['centrodecusto']),
      contaContabil: texto(l['contacontabil']),
      descContaContabil: texto(l['desccontacontabil']),
    })
  }
  return { itens, erros: [] }
}

/** OF aberta resumida (uma por pedido), usada para sinalizar fornecedores pendentes que já têm OF. */
export interface OFAberta {
  pedido: string
  emissao: string | null
  status: string
  valor: number
  contrato: string | null
  descricao: string | null
}

export const ofFinalizada = (status: string) => /PAGO|FINALIZAD/.test(status)

/**
 * OFs abertas (emitidas, não pagas/finalizadas) agrupadas por fornecedor.
 * "A emitir" (sem nº de OF) não entra: ainda não existe OF.
 */
export function ofsAbertasPorFornecedor(itens: ItemOF[]): Map<string, OFAberta[]> {
  const porPedido = new Map<string, OFAberta & { cod: string }>()
  for (const i of itens) {
    if (!i.pedido || !i.codFornecedor || ofFinalizada(i.status)) continue
    const o = porPedido.get(i.pedido) ?? { cod: i.codFornecedor, pedido: i.pedido, emissao: i.emissao, status: i.status, valor: 0, contrato: i.contrato, descricao: i.descricao }
    o.valor += i.valorTotal
    porPedido.set(i.pedido, o)
  }
  const m = new Map<string, OFAberta[]>()
  for (const { cod, ...o } of porPedido.values()) m.set(cod, [...(m.get(cod) ?? []), o])
  for (const l of m.values()) l.sort((a, b) => (b.emissao ?? '').localeCompare(a.emissao ?? ''))
  return m
}

/** OFs abertas que valem para a competência: emitidas até o fim do mês (ou sem data de emissão). */
export function ofsDaCompetencia(ofs: OFAberta[] | undefined, competencia: string): OFAberta[] {
  const fim = `${competencia}-31`
  return (ofs ?? []).filter((o) => !o.emissao || o.emissao <= fim)
}

/**
 * Identifica o fornecedor de cada OF: pelo contrato (a view de contratos traz o código, ligação exata);
 * se a OF não tem contrato conhecido, pelo nome no cadastro ADM.
 */
export function vincularFornecedoresOF(itens: ItemOF[], contratos: ContratoProtheus[], fornecedores: Fornecedor[]): ItemOF[] {
  const porContrato = new Map(contratos.map((c) => [c.contrato, c.codFornecedor]))
  return vincularFornecedores(itens, fornecedores).map((i) => ({ ...i, codFornecedor: (i.contrato && porContrato.get(i.contrato)) || i.codFornecedor }))
}
