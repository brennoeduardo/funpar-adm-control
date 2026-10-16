// Tipos compartilhados entre o gerador (Node) e a interface (navegador).
// Datas sempre como string ISO 'AAAA-MM-DD'; competências como 'AAAA-MM'.

export type Gravidade = 'erro' | 'aviso'

export interface Problema {
  origem: string
  linha?: number
  mensagem: string
  gravidade: Gravidade
}

export type Periodicidade = 'MENSAL' | 'PERIODICO' | 'ANUAL' | 'SOB_DEMANDA'

export interface Fornecedor {
  codigo: string
  /** null = aceita qualquer loja do código */
  loja: string | null
  cnpj: string | null
  razaoSocial: string
  nome: string
  formaPagamento: string | null
  solicitante: string | null
  ativo: boolean
  observacoes: string | null
}

export interface Contrato {
  numero: string
  codFornecedor: string
  loja: string | null
  processo: string | null
  objeto: string | null
  produto: string | null
  tipo: string | null
  periodicidade: Periodicidade
  valorReferencia: number | null
  /** Tolerância (%) para vincular um título pelo valor */
  toleranciaPct: number
  diaVencimento: number | null
  vencimentoTexto: string | null
  dataInicio: string | null
  dataFim: string | null
  natureza: string | null
  contaPag: string | null
  centroCusto: string | null
  tipoEntrada: string | null
  especieDoc: string | null
  retemImposto: boolean | null
  ativo: boolean
  observacoes: string | null
}

export interface Rateio {
  contrato: string
  centroCusto: string
  percentual: number
}

export interface Ajuste {
  chaveTitulo: string
  contrato: string | null
  competencia: string | null
  observacao: string | null
}

export interface Cadastros {
  fornecedores: Fornecedor[]
  contratos: Contrato[]
  rateios: Rateio[]
  ajustes: Ajuste[]
  problemas: Problema[]
}

export interface Retencoes {
  iss: number
  irrf: number
  inss: number
  pis: number
  cofins: number
  csll: number
}

export interface OrigemTitulo {
  arquivo: string
  geradoEm: string
}

export interface Titulo {
  chave: string
  filial: string
  prefixo: string
  numero: string
  parcela: string
  tipo: string
  fornecedor: string
  loja: string
  razaoSocial: string
  cnpj: string | null
  emissao: string | null
  /** Data em que o título foi lançado no Protheus (DT Contab.) */
  lancamento: string | null
  vencimento: string | null
  vencimentoReal: string | null
  valor: number
  saldo: number
  baixa: string | null
  /** Número do protocolo sem zeros à esquerda e sem sufixo (ex.: '630056') */
  protocolo: string | null
  natureza: string | null
  contaPag: string | null
  historico: string | null
  liberacao: string | null
  bordero: string | null
  usuario: string | null
  retencoes: Retencoes
  origem: OrigemTitulo
}

export type TipoCobertura = 'baixados' | 'abertos' | 'misto'

/** O que um relatório importado cobre — usado para não confundir "ausente" com "pendente". */
export interface Cobertura {
  arquivo: string
  hash: string
  geradoEm: string
  importadoEm: string
  layout: string
  tipo: TipoCobertura
  baixaIni: string | null
  baixaFim: string | null
  /** Período de emissão dos títulos do arquivo */
  emissaoIni: string | null
  emissaoFim: string | null
  /** Retrato completo do período (view): títulos ausentes foram excluídos no Protheus */
  completo?: boolean
  linhas: number
  erros: string[]
}

export type MotivoVinculo = 'ajuste' | 'unico' | 'valor' | 'nenhum'

export interface TituloVinculado extends Titulo {
  contrato: string | null
  competencia: string | null
  motivoVinculo: MotivoVinculo
  alertas: string[]
  observacaoAjuste: string | null
}

export interface Candidato {
  codigo: string
  loja: string
  nome: string
  cnpj: string | null
  quantidade: number
  total: number
  naturezas: string[]
}

/** Item de solicitação aberta (view de solicitações): Atas/Contratos ou Formulário de Compras. */
export interface Solicitacao {
  origem: string
  protocolo: string | null
  solicitante: string | null
  /** Nome do fornecedor/beneficiário como vem da view (a view não traz código nem CNPJ) */
  fornecedor: string
  /** Código do fornecedor no cadastro ADM, quando o nome bate */
  codFornecedor: string | null
  data: string | null
  descricao: string | null
  valor: number
  status: string
  centroCusto: string | null
  contaContabil: string | null
  descContaContabil: string | null
}

/** Resumo dos pagamentos de um fornecedor (todos os títulos do Contas a Pagar, não só os do escopo ADM). */
export interface ResumoPagamentos {
  /** Total baixado no ano corrente */
  pagoNoAno: number
  titulosNoAno: number
  ultimoPagamento: string | null
  ultimoValor: number | null
  /** Média mensal paga nos últimos 3 meses com pagamento */
  mediaRecente: number | null
  /** Títulos lançados e ainda não pagos */
  aPagar: number
  valorAPagar: number
}

/** Contrato do Protheus (view de contratos), já agrupado: uma entrada por contrato. */
export interface ContratoProtheus {
  contrato: string
  codFornecedor: string
  cnpj: string | null
  fornecedor: string
  processo: string | null
  inicio: string | null
  fim: string | null
  objeto: string | null
  produtos: { codigo: string; descricao: string | null }[]
  centrosCusto: { codigo: string; descricao: string | null }[]
  centroNegocio: string | null
  natureza: string | null
  descNatureza: string | null
  tipo: string | null
  tipoVencimento: string | null
  valorMedio: number | null
  /** Pagamentos do fornecedor (calculados pelo gerador com todos os títulos) */
  pagamentos?: ResumoPagamentos
}

export interface DadosADM {
  versao: 1
  geradoEm: string
  origem: 'gerador' | 'manual'
  coberturas: Cobertura[]
  fornecedores: Fornecedor[]
  contratos: Contrato[]
  rateios: Rateio[]
  ajustes: Ajuste[]
  titulos: TituloVinculado[]
  ignorados: number
  candidatos: Candidato[]
  problemas: Problema[]
  /** Arquivos de relatório que não puderam ser lidos na última execução */
  falhas: { arquivo: string; erro: string }[]
  /** Solicitações abertas (Atas/Contratos e Compras); retrato da última extração */
  solicitacoes?: Solicitacao[]
  solicitacoesGeradoEm?: string | null
  /** Contratos vigentes do Protheus; retrato da última extração */
  contratosProtheus?: ContratoProtheus[]
  contratosGeradoEm?: string | null
}
