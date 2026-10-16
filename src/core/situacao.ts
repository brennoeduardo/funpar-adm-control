import type { Cobertura, Contrato, DadosADM, Fornecedor, Titulo, TituloVinculado } from './tipos'
import { competenciaDe, diasEntre, fimCompetencia, inicioCompetencia } from './util'

/**
 * Controle de lançamentos: para cada fornecedor e competência, o título foi lançado no Protheus? Foi pago?
 * Um título que aparece no relatório está lançado; com data de baixa (e sem saldo), está pago.
 */
export type Situacao = 'pago' | 'lancado' | 'vencido' | 'nao_lancado' | 'sem_registro' | 'fora_cobertura' | 'nao_previsto' | 'futuro'

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  pago: 'Lançado e pago',
  lancado: 'Lançado · a pagar',
  vencido: 'Lançado · vencido',
  nao_lancado: 'Não lançado',
  sem_registro: 'Sem registro',
  fora_cobertura: 'Fora de cobertura',
  nao_previsto: 'Não previsto',
  futuro: 'Futuro',
}

export const DESCRICAO_SITUACAO: Record<Situacao, string> = {
  pago: 'Título lançado no Protheus e baixado (pago)',
  lancado: 'Título lançado no Protheus, com saldo a pagar dentro do vencimento',
  vencido: 'Título lançado no Protheus, com saldo a pagar e vencimento já passado',
  nao_lancado: 'Nenhum título lançado: o relatório importado traz todos os títulos do período (pagos e em aberto)',
  sem_registro:
    'Nenhum pagamento encontrado. O relatório importado traz só títulos pagos, então pode haver título lançado e ainda não pago',
  fora_cobertura: 'Nenhum relatório importado cobre este mês',
  nao_previsto: 'Fornecedor inativo ou sem pagamento mensal previsto',
  futuro: 'Competência ainda não chegou',
}

/** Folga (dias) nas pontas do mês: os períodos vêm das datas reais dos títulos. */
const FOLGA_COBERTURA = 5

function uniaoCobre(periodos: [string, string][], competencia: string): boolean {
  const ini = inicioCompetencia(competencia)
  const fim = fimCompetencia(competencia)
  const ordenados = [...periodos].sort((a, b) => a[0].localeCompare(b[0]))
  const unidos: [string, string][] = []
  for (const p of ordenados) {
    const u = unidos.at(-1)
    if (u && diasEntre(u[1], p[0]) <= FOLGA_COBERTURA) u[1] = p[1] > u[1] ? p[1] : u[1]
    else unidos.push([...p])
  }
  return unidos.some(([a, b]) => diasEntre(a, ini) >= -FOLGA_COBERTURA && diasEntre(fim, b) >= -FOLGA_COBERTURA)
}

/**
 * Lançamentos cobertos: um relatório com títulos pagos e em aberto (filtrado pela emissão)
 * abrange o mês inteiro — então a ausência de título significa "não lançado".
 */
export function lancamentosCobertos(competencia: string, coberturas: Cobertura[]): boolean {
  return uniaoCobre(
    coberturas.filter((c) => c.tipo !== 'baixados' && c.emissaoIni && c.emissaoFim).map((c) => [c.emissaoIni!, c.emissaoFim!]),
    competencia,
  )
}

/** Pagamentos cobertos: as baixas importadas abrangem o mês inteiro. */
export function pagamentosCobertos(competencia: string, coberturas: Cobertura[]): boolean {
  return uniaoCobre(
    coberturas.filter((c) => c.baixaIni && c.baixaFim).map((c) => [c.baixaIni!, c.baixaFim!]),
    competencia,
  )
}

/** Mantido para compatibilidade: algum relatório permite afirmar algo sobre o mês. */
export function competenciaCoberta(competencia: string, coberturas: Cobertura[]): boolean {
  return lancamentosCobertos(competencia, coberturas) || pagamentosCobertos(competencia, coberturas)
}

export function situacaoDosTitulos(titulos: Titulo[], hoje: string): Situacao | null {
  if (!titulos.length) return null
  const aPagar = titulos.filter((t) => t.saldo > 0 || !t.baixa)
  if (aPagar.length) return aPagar.some((t) => (t.vencimentoReal ?? '9999') < hoje) ? 'vencido' : 'lancado'
  return 'pago'
}

/**
 * Previsão mensal por fornecedor (o controle de contratos está em espera, então não usa vigência):
 * fornecedor ativo, sem contratos cadastrados ou com algum contrato ativo de periodicidade mensal.
 */
export function previstoParaFornecedor(f: Fornecedor, contratos: Contrato[]): boolean {
  if (!f.ativo) return false
  const doFornecedor = contratos.filter((c) => c.codFornecedor === f.codigo && c.ativo)
  return doFornecedor.length === 0 || doFornecedor.some((c) => c.periodicidade === 'MENSAL')
}

export function situacaoCelula(
  previsto: boolean,
  competencia: string,
  titulos: Titulo[],
  coberturas: Cobertura[],
  hoje: string,
): Situacao {
  const s = situacaoDosTitulos(titulos, hoje)
  if (s) return s
  if (!previsto) return 'nao_previsto'
  if (competencia > competenciaDe(hoje)!) return 'futuro'
  if (lancamentosCobertos(competencia, coberturas)) return 'nao_lancado'
  return pagamentosCobertos(competencia, coberturas) ? 'sem_registro' : 'fora_cobertura'
}

export interface Celula {
  situacao: Situacao
  titulos: TituloVinculado[]
  valor: number
  valorPago: number
}

export interface LinhaMatriz {
  id: string
  fornecedor: Fornecedor
  previsto: boolean
  celulas: Record<string, Celula>
}

/** Matriz fornecedor × competência. */
export function montarMatriz(dados: DadosADM, competencias: string[], hoje: string): LinhaMatriz[] {
  return dados.fornecedores
    .map((f) => {
      const titulos = dados.titulos.filter((t) => t.fornecedor === f.codigo && (!f.loja || t.loja === f.loja))
      const previsto = previstoParaFornecedor(f, dados.contratos)
      const celulas: Record<string, Celula> = {}
      for (const comp of competencias) {
        const doMes = titulos.filter((t) => t.competencia === comp)
        celulas[comp] = {
          situacao: situacaoCelula(previsto, comp, doMes, dados.coberturas, hoje),
          titulos: doMes,
          valor: doMes.reduce((s, t) => s + t.valor, 0),
          valorPago: doMes.filter((t) => t.baixa && t.saldo <= 0).reduce((s, t) => s + t.valor, 0),
        }
      }
      return { id: `f:${f.codigo}|${f.loja ?? '*'}`, fornecedor: f, previsto, celulas }
    })
    .sort((a, b) => a.fornecedor.nome.localeCompare(b.fornecedor.nome, 'pt-BR'))
}

// ---------- Vigência de contratos (controle de contratos em espera; mantido para retomar depois) ----------

export type Vigencia = 'vigente' | 'vencendo' | 'vencido' | 'a_iniciar' | 'sem_data' | 'inativo'

export const ROTULO_VIGENCIA: Record<Vigencia, string> = {
  vigente: 'Vigente',
  vencendo: 'Vencendo',
  vencido: 'Vencido',
  a_iniciar: 'A iniciar',
  sem_data: 'Sem data fim',
  inativo: 'Inativo',
}

export function vigenciaDe(c: Contrato, hoje: string, alertaDias = 90): { vigencia: Vigencia; dias: number | null } {
  if (!c.ativo) return { vigencia: 'inativo', dias: null }
  if (c.dataInicio && c.dataInicio > hoje) return { vigencia: 'a_iniciar', dias: diasEntre(hoje, c.dataInicio) }
  if (!c.dataFim) return { vigencia: 'sem_data', dias: null }
  const dias = diasEntre(hoje, c.dataFim)
  if (dias < 0) return { vigencia: 'vencido', dias }
  return { vigencia: dias <= alertaDias ? 'vencendo' : 'vigente', dias }
}

/** '000000000006303' → '6303' */
export function numeroCurto(numero: string): string {
  return /^\d+$/.test(numero) ? numero.replace(/^0+/, '') || '0' : numero
}
