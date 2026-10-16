/**
 * Etapa 1 — gera o cadastros.xlsx a partir da planilha FORNECEDORES CONTRATOS 2026.xlsm
 * (abas Base, Inicio e abas de fornecedor) e lista o que o setor precisa revisar.
 *
 * Uso: npm run migrar -- --planilha "<xlsm>" --saida "<cadastros.xlsx>" [--fina "<fina750.xlsx>"] [--forcar]
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'
import * as XLSX from 'xlsx'
import { LAYOUT, TOLERANCIA_PADRAO, lerCadastros, lerRelatorio } from '../src/core/index'
import { codigo, dataISO, documento, hojeISO, numero, texto } from '../src/core/util'
import { abaTabela, arquivoRelatorio, gravarPasta, lerBytes } from './lib/xlsx-node'

const { values: args } = parseArgs({
  options: {
    planilha: { type: 'string' },
    saida: { type: 'string' },
    fina: { type: 'string' },
    forcar: { type: 'boolean', default: false },
  },
})
if (!args.planilha || !args.saida) {
  console.error('Informe --planilha e --saida')
  process.exit(1)
}
if (existsSync(args.saida) && !args.forcar) {
  console.error(`${args.saida} já existe. Use --forcar para sobrescrever (o arquivo atual pode ter edições do setor).`)
  process.exit(1)
}

const pasta = XLSX.read(lerBytes(args.planilha), { type: 'array' })
const valor = (aba: string, ref: string): unknown => pasta.Sheets[aba]?.[ref]?.v
const hoje = hojeISO()
const revisar: unknown[][] = []
const anotar = (gravidade: string, assunto: string, detalhe: string) => revisar.push([gravidade, assunto, detalhe])

// --- Base: uma linha por contrato ---
const base = XLSX.utils.sheet_to_json<unknown[]>(pasta.Sheets['Base']!, { header: 1, raw: true, defval: null }).slice(1)
  .filter((l) => texto(l[0]))

// --- Abas de fornecedor: código em I4 e parâmetros de lançamento ---
interface ParamAba { aba: string; dia: string | null; tipoEntrada: string | null; especie: string | null; imposto: string | null; blocos: number; layoutInvertido: boolean }
const porCodigo = new Map<string, ParamAba>()
for (const aba of pasta.SheetNames.slice(3)) {
  const cod = codigo(valor(aba, 'I4'))
  if (!cod) continue
  const ws = pasta.Sheets[aba]!
  const blocos = Object.keys(ws).filter((ref) => !ref.startsWith('!') && ref.startsWith('A') && ws[ref]?.v === 'LANÇAMENTOS REALIZADOS').length
  const te = texto(valor(aba, 'F4'))
  porCodigo.set(cod, {
    aba,
    dia: texto(valor(aba, 'D4')),
    tipoEntrada: te ? te.padStart(3, '0') : null,
    especie: texto(valor(aba, 'G4')),
    imposto: texto(valor(aba, 'H4')),
    blocos,
    layoutInvertido: valor(aba, 'A11') === 'DESCRIÇÃO',
  })
}

// --- Inicio: solicitante e vencimento por aba ---
const inicio = new Map<string, { solicitante: string | null; venc: string | null }>()
for (let r = 3; r <= 42; r++) {
  const aba = texto(valor('Inicio', `C${r}`))
  if (!aba) continue
  inicio.set(aba, {
    solicitante: texto(valor('Inicio', `D${r}`)),
    venc: texto(valor('Inicio', `E${r}`)),
  })
}

// --- Lojas observadas no relatório do Protheus (opcional) ---
const lojas = new Map<string, Set<string>>()
if (args.fina) {
  const rel = lerRelatorio(arquivoRelatorio(args.fina))
  for (const t of rel.titulos) lojas.set(t.fornecedor, (lojas.get(t.fornecedor) ?? new Set()).add(t.loja))
}

const fornecedores: unknown[][] = []
const contratos: unknown[][] = []
const vistos = new Set<string>()
const contratosPorFornecedor = new Map<string, number>()

for (const l of base) {
  const cod = codigo(l[0])!
  contratosPorFornecedor.set(cod, (contratosPorFornecedor.get(cod) ?? 0) + 1)
}

for (const l of base) {
  const cod = codigo(l[0])!
  const razao = texto(l[2]) ?? ''
  const param = porCodigo.get(cod)
  const ini = param ? inicio.get(param.aba) : undefined
  const lojasCod = [...(lojas.get(cod) ?? [])]
  const loja = lojasCod.length === 1 ? lojasCod[0]! : null

  if (!vistos.has(cod)) {
    vistos.add(cod)
    const cnpj = documento(l[1])
    if (!cnpj) anotar('aviso', razao, 'CNPJ zerado na Base (fornecedor estrangeiro?). Mantido em branco')
    if (args.fina && !lojasCod.length) anotar('info', razao, 'Não aparece no relatório do Protheus usado na migração: loja deixada em branco (aceita qualquer loja)')
    if (lojasCod.length > 1) anotar('aviso', razao, `Aparece com várias lojas no Protheus (${lojasCod.join(', ')}): loja deixada em branco`)
    if (!param) anotar('aviso', razao, 'Sem aba própria na planilha: solicitante e parâmetros de lançamento não migrados')
    if (param?.layoutInvertido) anotar('aviso', razao, `Aba "${param.aba}" tem layout invertido (DESCRIÇÃO na coluna A): a aba Inicio exibia os meses deslocados`)
    if (param && param.blocos > 1) anotar('aviso', razao, `Aba "${param.aba}" tem ${param.blocos} blocos de lançamento para ${contratosPorFornecedor.get(cod)} contrato(s): confirmar se são dois títulos mensais`)
    fornecedores.push([
      cod, loja, cnpj, razao, param?.aba ?? razao, texto(l[3]),
      ini?.solicitante ?? null, 'S', null,
    ])
  }

  const numeroCt = texto(l[4])!
  const objeto = texto(String(l[10] ?? '').replace(/\\13\\10/g, ' '))
  const valorRef = numero(l[18])
  const fim = dataISO(l[7])
  const cc = texto(l[11])
  const ccDescricao = texto(l[13])
  const natureza = texto(l[14])

  // Vencimento: dia numérico vai em "Dia Vencimento"; regras como "19/20" ficam no texto.
  const vencBruto = param?.dia ?? ini?.venc ?? null
  const dia = vencBruto && /^\d{1,2}$/.test(vencBruto) ? Number(vencBruto) : null
  const vencTexto = dia === null ? vencBruto : null

  if (fim && fim < hoje) anotar('erro', `${razao} · ${numeroCt}`, `Vigência terminou em ${fim.split('-').reverse().join('/')}: renovado? cadastrar aditivo ou marcar Ativo = N`)
  if (!valorRef) anotar('aviso', `${razao} · ${numeroCt}`, 'Valor de referência zerado: sem ele não há vínculo por valor nem previsão de desembolso')
  if (cc && /variavel/i.test(cc)) anotar('aviso', `${razao} · ${numeroCt}`, 'Centro de custo "VARIAVEL": definir rateio na aba Rateio')
  if (ccDescricao && /pendente rateio/i.test(ccDescricao)) anotar('aviso', `${razao} · ${numeroCt}`, 'Centro de custo marcado como "PENDENTE RATEIO" na Base')
  if (natureza && texto(l[15]) === '..') anotar('aviso', `${razao} · ${numeroCt}`, `Natureza ${natureza} sem descrição na Base`)
  if (vencTexto) anotar('info', `${razao} · ${numeroCt}`, `Vencimento "${vencTexto}" não é um dia único: mantido em "Vencimento (texto)"`)
  if ((contratosPorFornecedor.get(cod) ?? 0) > 1) anotar('info', `${razao} · ${numeroCt}`, 'Fornecedor com vários contratos: o vínculo dos títulos será pelo valor de referência (tolerância na coluna Tolerância %)')

  contratos.push([
    numeroCt, cod, null, texto(l[5]) === '-' ? null : texto(l[5]), objeto,
    [texto(l[8]), texto(l[9])].filter(Boolean).join(' - ') || null,
    texto(l[16]), texto(l[17]) ?? 'MENSAL', valorRef, TOLERANCIA_PADRAO, dia, vencTexto,
    dataComoDate(dataISO(l[6])), dataComoDate(fim), natureza, texto(l[19]),
    [cc, ccDescricao].filter(Boolean).join(' - ') || null,
    param?.tipoEntrada ?? null, param?.especie ?? null, param?.imposto ?? null, 'S', null,
  ])
}

function dataComoDate(iso: string | null): Date | null {
  if (!iso) return null
  const [a, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(a, m - 1, d)
}

// --- Monta o cadastros.xlsx ---
const saida = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(saida, abaInstrucoes(), 'Instruções')
XLSX.utils.book_append_sheet(saida, abaTabela(LAYOUT.Fornecedores, fornecedores, [12, 6, 16, 45, 32, 18, 18, 6, 30]), 'Fornecedores')
XLSX.utils.book_append_sheet(saida, abaTabela(LAYOUT.Contratos, contratos, [18, 12, 6, 18, 60, 45, 20, 12, 14, 11, 10, 14, 12, 12, 10, 18, 40, 10, 10, 10, 6, 30]), 'Contratos')
XLSX.utils.book_append_sheet(saida, abaTabela(LAYOUT.Rateio, []), 'Rateio')
XLSX.utils.book_append_sheet(saida, abaTabela(LAYOUT.Ajustes, [], [45, 18, 12, 50]), 'Ajustes')
const ordem: Record<string, number> = { erro: 0, aviso: 1, info: 2 }
revisar.sort((a, b) => (ordem[a[0] as string] ?? 9) - (ordem[b[0] as string] ?? 9))
XLSX.utils.book_append_sheet(saida, abaTabela(['Gravidade', 'Assunto', 'Detalhe'], revisar, [10, 60, 110]), 'Revisar (migração)')

mkdirSync(dirname(args.saida), { recursive: true })
gravarPasta(saida, args.saida)

// Relê com o mesmo validador usado pelo painel, para garantir que o arquivo gerado é válido.
const validado = lerCadastros(lerBytes(args.saida))
console.log(`Gerado ${args.saida}`)
console.log(`  ${validado.fornecedores.length} fornecedores, ${validado.contratos.length} contratos`)
console.log(`  Itens para revisar: ${revisar.length} (erro: ${revisar.filter((r) => r[0] === 'erro').length})`)
console.log(`  Problemas na validação: ${validado.problemas.length}`)
for (const p of validado.problemas) console.log(`   - [${p.gravidade}] ${p.origem}${p.linha ? ` linha ${p.linha}` : ''}: ${p.mensagem}`)

function abaInstrucoes(): XLSX.WorkSheet {
  const linhas = [
    ['FUNPAR ADM Control — Cadastros'],
    [''],
    ['Este arquivo alimenta o painel. Edite as abas Fornecedores, Contratos, Rateio e Ajustes.'],
    ['Não renomeie abas nem cabeçalhos. Uma pessoa por vez deve editar o arquivo.'],
    [''],
    ['Fornecedores', 'Código Protheus + Loja identificam o fornecedor nos relatórios. Loja em branco = aceita qualquer loja.'],
    ['Contratos', 'Periodicidade: MENSAL, PERIÓDICO, ANUAL ou SOB DEMANDA. Só MENSAL gera previsão todo mês.'],
    ['', 'Valor Referência + Tolerância % são usados para vincular títulos quando o fornecedor tem vários contratos.'],
    ['', 'Dia Vencimento: número de 1 a 31. Regras como "5/9/20" vão em "Vencimento (texto)".'],
    ['', 'Ativo = N tira o contrato das previsões, mas mantém o histórico.'],
    ['Rateio', 'Percentuais por centro de custo. A soma por contrato deve ser 100.'],
    ['Ajustes', 'Corrige o vínculo ou a competência de um título. Copie a "Chave Título" mostrada no painel.'],
    ['Revisar (migração)', 'Pontos encontrados na migração da planilha 2026. Pode apagar a aba depois de resolver.'],
  ]
  const aba = XLSX.utils.aoa_to_sheet(linhas)
  aba['!cols'] = [{ wch: 20 }, { wch: 110 }]
  return aba
}
