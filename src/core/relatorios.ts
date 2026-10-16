import { encontrarTabela, lerPasta, type Linha } from './planilha'
import type { Cobertura, TipoCobertura, Titulo } from './tipos'
import { codigo, dataISO, documento, numero, protocolo, texto } from './util'

export interface RelatorioLido {
  layout: string
  titulos: Titulo[]
  erros: string[]
  tipo: TipoCobertura
  baixaIni: string | null
  baixaFim: string | null
  emissaoIni: string | null
  emissaoFim: string | null
  linhas: number
  /** Retrato completo do período: títulos ausentes foram excluídos no Protheus */
  completo: boolean
}

export interface ArquivoRelatorio {
  nome: string
  bytes: Uint8Array
  /** Data/hora de geração (modificação do arquivo), ISO */
  geradoEm: string
  hash: string
}

/** Chave natural do título no Protheus (SE2). */
export function chaveTitulo(t: Pick<Titulo, 'filial' | 'prefixo' | 'numero' | 'parcela' | 'tipo' | 'fornecedor' | 'loja'>): string {
  return [t.filial, t.prefixo, t.numero, t.parcela, t.tipo, t.fornecedor, t.loja].join('|')
}

/** Nome das colunas (normalizadas) de cada campo, por layout de relatório. */
interface MapaColunas {
  filial: string
  prefixo: string
  numero: string
  parcela: string
  tipo: string
  fornecedor: string
  loja: string
  razaoSocial: string[]
  cnpj: string
  emissao: string
  lancamento: string
  vencimento: string
  vencimentoReal: string
  valor: string
  saldo: string
  baixa: string
  protocolo: string
  natureza: string
  contaPag: string
  historico: string[]
  liberacao: string
  bordero: string
  usuario?: string
  iss: string
  irrf: string
  inss: string
  pis: string
  cofins: string
  csll: string
}

interface Layout {
  nome: string
  /** Cabeçalhos que identificam o layout */
  marcadores: string[]
  colunas: MapaColunas
  /**
   * Retrato completo do período (todos os títulos, pagos e em aberto, já sem os excluídos no Protheus).
   * Títulos que sumiram dele foram excluídos e saem do painel.
   */
  completo: boolean
}

const LAYOUTS: Layout[] = [
  {
    // View do Contas a Pagar (SE2) fornecida pela TI
    nome: 'VIEW_SE2',
    marcadores: ['COD FORN', 'LJ FORN', 'NUMERO', 'VALOR', 'EMISSAO'],
    completo: true,
    colunas: {
      filial: 'filial', prefixo: 'prefixo', numero: 'numero', parcela: 'parcela', tipo: 'tipo', fornecedor: 'codforn', loja: 'ljforn',
      razaoSocial: ['razaosocial'], cnpj: 'cnpjcpf', emissao: 'emissao', lancamento: 'dtcontab', vencimento: 'vencto', vencimentoReal: 'venctoreal',
      valor: 'valor', saldo: 'saldo', baixa: 'baixa', protocolo: 'protoc', natureza: 'naturez', contaPag: 'contapag', historico: ['hist'],
      liberacao: 'dtlibera', bordero: 'numbordero',
      iss: 'iss', irrf: 'irrf', inss: 'inss', pis: 'pis', cofins: 'cofins', csll: 'csll',
    },
  },
  {
    // Browse do FINA750 exportado pelo "imprimir browse"
    nome: 'FINA750',
    marcadores: ['No. Titulo', 'Fornecedor', 'Loja', 'Vlr.Titulo', 'Vencimento'],
    completo: false,
    colunas: {
      filial: 'filial', prefixo: 'prefixo', numero: 'notitulo', parcela: 'parcela', tipo: 'tipo', fornecedor: 'fornecedor', loja: 'loja',
      razaoSocial: ['razaosocial', 'nomefornece'], cnpj: 'cnpjcpf', emissao: 'dtemissao', lancamento: 'dtcontab', vencimento: 'vencimento', vencimentoReal: 'venctoreal',
      valor: 'vlrtitulo', saldo: 'saldo', baixa: 'dtbaixa', protocolo: 'protocolo', natureza: 'natureza', contaPag: 'contapag', historico: ['histintel', 'historico'],
      liberacao: 'dtliberacao', bordero: 'numbordero', usuario: 'usuario',
      iss: 'iss', irrf: 'irrf', inss: 'inss', pis: 'pispasep', cofins: 'cofins', csll: 'csll',
    },
  },
]

/** '010100001-FUNPAR ADM' (browse) e '010100001' (view) são a mesma filial. */
function filialDe(v: unknown): string {
  return (texto(v) ?? '').split('-')[0]!.trim()
}

function primeiro(l: Linha, colunas: string[]): string | null {
  for (const c of colunas) {
    const v = texto(l[c])
    if (v) return v
  }
  return null
}

/** Datas da view vêm como texto 'AAAAMMDD' (ou espaços quando vazias). */
function dataDe(v: unknown): string | null {
  return dataISO(typeof v === 'string' ? texto(v) : v)
}

function lerLinhas(linhas: Linha[], m: MapaColunas, arquivo: string, geradoEm: string): Omit<RelatorioLido, 'layout' | 'completo'> {
  const erros: string[] = []
  const titulos: Titulo[] = []
  for (const l of linhas) {
    const numeroTitulo = texto(l[m.numero])
    const fornecedor = codigo(l[m.fornecedor])
    const valor = numero(l[m.valor])
    if (!numeroTitulo || !fornecedor || valor === null) {
      // Linhas de total/rodapé não têm título; só reporta se parecer um registro.
      if (numeroTitulo || fornecedor) erros.push(`Linha ${l.__linha}: título, fornecedor ou valor ausente`)
      continue
    }
    const base = {
      filial: filialDe(l[m.filial]),
      prefixo: texto(l[m.prefixo]) ?? '',
      numero: numeroTitulo,
      parcela: texto(l[m.parcela]) ?? '',
      tipo: texto(l[m.tipo]) ?? '',
      fornecedor,
      loja: codigo(l[m.loja], 4) ?? '',
    }
    titulos.push({
      ...base,
      chave: chaveTitulo(base),
      razaoSocial: primeiro(l, m.razaoSocial) ?? '',
      cnpj: documento(l[m.cnpj]),
      emissao: dataDe(l[m.emissao]),
      lancamento: dataDe(l[m.lancamento]),
      vencimento: dataDe(l[m.vencimento]),
      vencimentoReal: dataDe(l[m.vencimentoReal]) ?? dataDe(l[m.vencimento]),
      valor,
      saldo: numero(l[m.saldo]) ?? 0,
      baixa: dataDe(l[m.baixa]),
      protocolo: protocolo(l[m.protocolo]),
      natureza: texto(l[m.natureza]),
      contaPag: texto(l[m.contaPag]),
      historico: primeiro(l, m.historico),
      liberacao: dataDe(l[m.liberacao]),
      bordero: texto(l[m.bordero]),
      usuario: m.usuario ? texto(l[m.usuario]) : null,
      retencoes: {
        iss: numero(l[m.iss]) ?? 0,
        irrf: numero(l[m.irrf]) ?? 0,
        inss: numero(l[m.inss]) ?? 0,
        pis: numero(l[m.pis]) ?? 0,
        cofins: numero(l[m.cofins]) ?? 0,
        csll: numero(l[m.csll]) ?? 0,
      },
      origem: { arquivo, geradoEm },
    })
  }

  // Cobertura: o que este arquivo permite afirmar.
  const comSaldo = titulos.filter((t) => t.saldo > 0).length
  const tipo: TipoCobertura = comSaldo === 0 ? 'baixados' : comSaldo === titulos.length ? 'abertos' : 'misto'
  const baixas = titulos.map((t) => t.baixa).filter((b): b is string => !!b).sort()
  const emissoes = titulos.map((t) => t.emissao).filter((e): e is string => !!e).sort()
  return {
    titulos,
    erros,
    tipo,
    baixaIni: baixas[0] ?? null,
    baixaFim: baixas[baixas.length - 1] ?? null,
    emissaoIni: emissoes[0] ?? null,
    emissaoFim: emissoes[emissoes.length - 1] ?? null,
    linhas: linhas.length,
  }
}

/** Identifica o layout do arquivo e devolve os títulos normalizados. */
export function lerRelatorio(arq: ArquivoRelatorio): RelatorioLido {
  let pasta
  try {
    pasta = lerPasta(arq.bytes, arq.nome)
  } catch (e) {
    return vazio(`Não foi possível abrir o arquivo: ${(e as Error).message}`)
  }
  for (const layout of LAYOUTS) {
    const tabela = encontrarTabela(pasta, layout.marcadores)
    if (tabela) return { layout: layout.nome, completo: layout.completo, ...lerLinhas(tabela.linhas, layout.colunas, arq.nome, arq.geradoEm) }
  }
  return vazio('Layout não reconhecido (esperado: view do Contas a Pagar ou browse do FINA750)')
}

function vazio(erro: string): RelatorioLido {
  return { layout: 'desconhecido', titulos: [], erros: [erro], tipo: 'baixados', baixaIni: null, baixaFim: null, emissaoIni: null, emissaoFim: null, linhas: 0, completo: false }
}

export function coberturaDe(arq: ArquivoRelatorio, r: RelatorioLido, importadoEm: string): Cobertura {
  return {
    arquivo: arq.nome,
    hash: arq.hash,
    geradoEm: arq.geradoEm,
    importadoEm,
    layout: r.layout,
    tipo: r.tipo,
    baixaIni: r.baixaIni,
    baixaFim: r.baixaFim,
    emissaoIni: r.emissaoIni,
    emissaoFim: r.emissaoFim,
    completo: r.completo,
    linhas: r.linhas,
    erros: r.erros.slice(0, 50),
  }
}

/**
 * Junta títulos sem duplicar: mesma chave = mesmo título.
 * Vale a versão do relatório gerado mais recentemente.
 */
export function mesclarTitulos(atuais: Iterable<Titulo>, novos: Iterable<Titulo>): Map<string, Titulo> {
  const mapa = new Map<string, Titulo>()
  for (const t of atuais) mapa.set(t.chave, t)
  for (const t of novos) {
    const existente = mapa.get(t.chave)
    if (!existente || t.origem.geradoEm >= existente.origem.geradoEm) mapa.set(t.chave, t)
  }
  return mapa
}
