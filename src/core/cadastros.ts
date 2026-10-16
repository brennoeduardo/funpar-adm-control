import { z } from 'zod'
import * as XLSX from 'xlsx'
import { lerPasta, linhasComCabecalho, type Linha } from './planilha'
import type { Ajuste, Cadastros, Contrato, Fornecedor, Periodicidade, Problema, Rateio } from './tipos'
import { codigo, competenciaValida, dataISO, documento, normalizarChave, numero, simNao, texto } from './util'

/**
 * Layout do cadastros.xlsx. Os rótulos são os cabeçalhos visíveis para o setor;
 * a leitura usa a forma normalizada (sem acento/pontuação), então pequenas variações são toleradas.
 */
export const LAYOUT = {
  Fornecedores: [
    'Código Protheus', 'Loja', 'CNPJ/CPF', 'Razão Social', 'Nome de Exibição', 'Forma de Pagamento',
    'Solicitante', 'Ativo', 'Observações',
  ],
  Contratos: [
    'Nº Contrato', 'Código Fornecedor', 'Loja', 'Processo Interno', 'Objeto', 'Produto', 'Tipo', 'Periodicidade',
    'Valor Referência', 'Tolerância %', 'Dia Vencimento', 'Vencimento (texto)', 'Data Início', 'Data Fim',
    'Natureza', 'Conta Pag.', 'Centro de Custo', 'Tipo Entrada', 'Espécie Doc.', 'Retém Imposto', 'Ativo', 'Observações',
  ],
  Rateio: ['Nº Contrato', 'Centro de Custo', 'Percentual'],
  Ajustes: ['Chave Título', 'Nº Contrato', 'Competência', 'Observação'],
} as const

export const TOLERANCIA_PADRAO = 10

const k = normalizarChave

const fornecedorSchema = z.object({
  codigo: z.string().min(1, 'Código Protheus obrigatório'),
  loja: z.string().nullable(),
  cnpj: z.string().regex(/^\d{11}$|^\d{14}$/, 'CNPJ/CPF deve ter 11 ou 14 dígitos').nullable(),
  razaoSocial: z.string().min(1, 'Razão Social obrigatória'),
  nome: z.string().min(1),
  formaPagamento: z.string().nullable(),
  solicitante: z.string().nullable(),
  ativo: z.boolean(),
  observacoes: z.string().nullable(),
})

const contratoSchema = z.object({
  numero: z.string().min(1, 'Nº Contrato obrigatório'),
  codFornecedor: z.string().min(1, 'Código Fornecedor obrigatório'),
  loja: z.string().nullable(),
  processo: z.string().nullable(),
  objeto: z.string().nullable(),
  produto: z.string().nullable(),
  tipo: z.string().nullable(),
  periodicidade: z.enum(['MENSAL', 'PERIODICO', 'ANUAL', 'SOB_DEMANDA']),
  valorReferencia: z.number().nonnegative().nullable(),
  toleranciaPct: z.number().min(0).max(100),
  diaVencimento: z.number().int().min(1).max(31).nullable(),
  vencimentoTexto: z.string().nullable(),
  dataInicio: z.string().nullable(),
  dataFim: z.string().nullable(),
  natureza: z.string().nullable(),
  contaPag: z.string().nullable(),
  centroCusto: z.string().nullable(),
  tipoEntrada: z.string().nullable(),
  especieDoc: z.string().nullable(),
  retemImposto: z.boolean().nullable(),
  ativo: z.boolean(),
  observacoes: z.string().nullable(),
})

function periodicidade(v: unknown): Periodicidade | 'INVALIDA' {
  const s = texto(v)
  if (!s) return 'MENSAL'
  const n = k(s)
  if (n.startsWith('mensal')) return 'MENSAL'
  if (n.startsWith('periodic')) return 'PERIODICO'
  if (n.startsWith('anual')) return 'ANUAL'
  if (n.startsWith('sobdemanda') || n.startsWith('demanda') || n.startsWith('variavel')) return 'SOB_DEMANDA'
  return 'INVALIDA'
}

function lerAba(pasta: XLSX.WorkBook, nome: keyof typeof LAYOUT, problemas: Problema[], obrigatoria: boolean): Linha[] {
  const real = pasta.SheetNames.find((s) => k(s) === k(nome))
  const aba = real ? pasta.Sheets[real] : undefined
  if (!aba) {
    if (obrigatoria) problemas.push({ origem: nome, mensagem: `Aba "${nome}" não encontrada`, gravidade: 'erro' })
    return []
  }
  const primeiro = LAYOUT[nome][0]
  const r = linhasComCabecalho(aba, [primeiro])
  if (!r) {
    problemas.push({ origem: nome, mensagem: `Cabeçalho "${primeiro}" não encontrado`, gravidade: 'erro' })
    return []
  }
  return r.linhas
}

function validar<T>(schema: z.ZodType<T>, valor: unknown, origem: string, linha: number, problemas: Problema[]): T | null {
  const r = schema.safeParse(valor)
  if (r.success) return r.data
  for (const issue of r.error.issues) {
    problemas.push({ origem, linha, mensagem: `${issue.path.join('.') || 'linha'}: ${issue.message}`, gravidade: 'erro' })
  }
  return null
}

export function lerCadastros(bytes: Uint8Array, nomeArquivo = 'cadastros.xlsx'): Cadastros {
  const problemas: Problema[] = []
  let pasta: XLSX.WorkBook
  try {
    pasta = lerPasta(bytes, nomeArquivo)
  } catch (e) {
    return { fornecedores: [], contratos: [], rateios: [], ajustes: [], problemas: [
      { origem: nomeArquivo, mensagem: `Não foi possível abrir: ${(e as Error).message}`, gravidade: 'erro' },
    ] }
  }

  const fornecedores: Fornecedor[] = []
  for (const l of lerAba(pasta, 'Fornecedores', problemas, true)) {
    const razao = texto(l[k('Razão Social')])
    const f = validar(fornecedorSchema, {
      codigo: codigo(l[k('Código Protheus')]),
      loja: codigo(l[k('Loja')], 4),
      cnpj: documento(l[k('CNPJ/CPF')]),
      razaoSocial: razao,
      nome: texto(l[k('Nome de Exibição')]) ?? razao ?? '',
      formaPagamento: texto(l[k('Forma de Pagamento')]),
      solicitante: texto(l[k('Solicitante')]),
      ativo: simNao(l[k('Ativo')]) ?? true,
      observacoes: texto(l[k('Observações')]),
    }, 'Fornecedores', l.__linha, problemas)
    if (f) fornecedores.push(f)
  }

  const contratos: Contrato[] = []
  for (const l of lerAba(pasta, 'Contratos', problemas, true)) {
    const per = periodicidade(l[k('Periodicidade')])
    if (per === 'INVALIDA') {
      problemas.push({ origem: 'Contratos', linha: l.__linha, mensagem: `Periodicidade inválida: "${texto(l[k('Periodicidade')])}" (use MENSAL, PERIÓDICO, ANUAL ou SOB DEMANDA)`, gravidade: 'erro' })
      continue
    }
    const diaTexto = texto(l[k('Dia Vencimento')])
    const dia = diaTexto && /^\d{1,2}$/.test(diaTexto) ? Number(diaTexto) : null
    if (diaTexto && dia === null) {
      problemas.push({ origem: 'Contratos', linha: l.__linha, mensagem: `Dia Vencimento deve ser um número de 1 a 31 (use "Vencimento (texto)" para regras como "5/9/20")`, gravidade: 'aviso' })
    }
    const c = validar(contratoSchema, {
      numero: codigo(l[k('Nº Contrato')], 15),
      codFornecedor: codigo(l[k('Código Fornecedor')]),
      loja: codigo(l[k('Loja')], 4),
      processo: texto(l[k('Processo Interno')]),
      objeto: texto(l[k('Objeto')]),
      produto: texto(l[k('Produto')]),
      tipo: texto(l[k('Tipo')]),
      periodicidade: per,
      valorReferencia: numero(l[k('Valor Referência')]),
      toleranciaPct: numero(l[k('Tolerância %')]) ?? TOLERANCIA_PADRAO,
      diaVencimento: dia,
      vencimentoTexto: texto(l[k('Vencimento (texto)')]) ?? (dia === null ? diaTexto : null),
      dataInicio: dataISO(l[k('Data Início')]),
      dataFim: dataISO(l[k('Data Fim')]),
      natureza: texto(l[k('Natureza')]),
      contaPag: texto(l[k('Conta Pag.')]),
      centroCusto: texto(l[k('Centro de Custo')]),
      tipoEntrada: texto(l[k('Tipo Entrada')]),
      especieDoc: texto(l[k('Espécie Doc.')]),
      retemImposto: simNao(l[k('Retém Imposto')]),
      ativo: simNao(l[k('Ativo')]) ?? true,
      observacoes: texto(l[k('Observações')]),
    }, 'Contratos', l.__linha, problemas)
    if (c) contratos.push(c)
  }

  const rateios: Rateio[] = []
  for (const l of lerAba(pasta, 'Rateio', problemas, false)) {
    const contrato = codigo(l[k('Nº Contrato')], 15)
    const centroCusto = texto(l[k('Centro de Custo')])
    const percentual = numero(l[k('Percentual')])
    if (!contrato || !centroCusto || percentual === null) {
      problemas.push({ origem: 'Rateio', linha: l.__linha, mensagem: 'Contrato, centro de custo e percentual são obrigatórios', gravidade: 'erro' })
      continue
    }
    rateios.push({ contrato, centroCusto, percentual })
  }

  const ajustes: Ajuste[] = []
  for (const l of lerAba(pasta, 'Ajustes', problemas, false)) {
    const chaveTitulo = texto(l[k('Chave Título')])
    if (!chaveTitulo) continue
    const compBruta = texto(l[k('Competência')])
    const competencia = competenciaValida(l[k('Competência')])
    if (compBruta && !competencia) {
      problemas.push({ origem: 'Ajustes', linha: l.__linha, mensagem: `Competência inválida "${compBruta}" (use AAAA-MM ou MM/AAAA)`, gravidade: 'erro' })
    }
    ajustes.push({ chaveTitulo, contrato: codigo(l[k('Nº Contrato')], 15), competencia, observacao: texto(l[k('Observação')]) })
  }

  validarRelacoes({ fornecedores, contratos, rateios, ajustes }, problemas)
  return { fornecedores, contratos, rateios, ajustes, problemas }
}

function validarRelacoes(c: Omit<Cadastros, 'problemas'>, problemas: Problema[]) {
  const vistos = new Set<string>()
  for (const f of c.fornecedores) {
    const chave = `${f.codigo}|${f.loja ?? '*'}`
    if (vistos.has(chave)) problemas.push({ origem: 'Fornecedores', mensagem: `Fornecedor ${f.codigo} loja ${f.loja ?? '(qualquer)'} cadastrado mais de uma vez`, gravidade: 'erro' })
    vistos.add(chave)
  }
  const codigos = new Set(c.fornecedores.map((f) => f.codigo))
  const numeros = new Set<string>()
  for (const ct of c.contratos) {
    if (numeros.has(ct.numero)) problemas.push({ origem: 'Contratos', mensagem: `Contrato ${ct.numero} cadastrado mais de uma vez`, gravidade: 'erro' })
    numeros.add(ct.numero)
    if (!codigos.has(ct.codFornecedor)) problemas.push({ origem: 'Contratos', mensagem: `Contrato ${ct.numero}: fornecedor ${ct.codFornecedor} não está na aba Fornecedores`, gravidade: 'erro' })
    if (ct.dataInicio && ct.dataFim && ct.dataFim < ct.dataInicio) problemas.push({ origem: 'Contratos', mensagem: `Contrato ${ct.numero}: Data Fim anterior à Data Início`, gravidade: 'erro' })
    if (ct.ativo && (ct.valorReferencia ?? 0) === 0 && ct.periodicidade === 'MENSAL') problemas.push({ origem: 'Contratos', mensagem: `Contrato ${ct.numero}: sem valor de referência (não dá para vincular títulos pelo valor)`, gravidade: 'aviso' })
  }
  const somas = new Map<string, number>()
  for (const r of c.rateios) {
    if (!numeros.has(r.contrato)) problemas.push({ origem: 'Rateio', mensagem: `Rateio para contrato inexistente ${r.contrato}`, gravidade: 'erro' })
    somas.set(r.contrato, (somas.get(r.contrato) ?? 0) + r.percentual)
  }
  for (const [ct, soma] of somas) {
    if (Math.abs(soma - 100) > 0.01) problemas.push({ origem: 'Rateio', mensagem: `Rateio do contrato ${ct} soma ${soma.toFixed(2)}% (deveria ser 100%)`, gravidade: 'erro' })
  }
  for (const a of c.ajustes) {
    if (a.contrato && !numeros.has(a.contrato)) problemas.push({ origem: 'Ajustes', mensagem: `Ajuste do título ${a.chaveTitulo}: contrato ${a.contrato} não existe`, gravidade: 'erro' })
  }
}
