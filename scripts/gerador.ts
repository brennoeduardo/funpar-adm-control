/**
 * Gerador (alternativa B1): lê a pasta de relatórios do Protheus + cadastros.xlsx e grava
 * dados.js / dados.json para o painel. Feito para rodar pelo Agendador de Tarefas do Windows.
 *
 * Uso: node gerador.mjs [--config config.json] [--reprocessar]
 *   --reprocessar  ignora o estado acumulado e relê todos os arquivos da pasta
 *   --imediato     importa também arquivos recém-gravados (após a extração automática da view)
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { conciliar, importarRelatorios, lerCadastros, type EstadoImportacao } from '../src/core/index'
import { lerSolicitacoes, vincularFornecedores } from '../src/core/solicitacoes'
import { lerContratosProtheus, resumirPagamentos } from '../src/core/contratosProtheus'
import { hojeISO } from '../src/core/util'
import { arquivoRelatorio, lerBytes } from './lib/xlsx-node'

const configSchema = z.object({
  /** Pasta onde a automação salva os relatórios (não é alterada pelo gerador) */
  pastaRelatorios: z.string(),
  /** Caminho do cadastros.xlsx */
  cadastros: z.string(),
  /** Pasta de saída: dados.js, dados.json, estado.json, historico/ */
  saida: z.string(),
  extensoes: z.array(z.string()).default(['.xlsx', '.xls', '.csv']),
  /** Arquivos alterados há menos que isso são ignorados (a automação pode estar gravando) */
  segundosMinimosDesdeAlteracao: z.number().default(60),
  historicoMaximo: z.number().default(90),
  /** Solicitações abertas (Atas/Contratos e Compras), extraídas pelo extrair-view.ps1 */
  solicitacoes: z.object({ arquivo: z.string() }).passthrough().optional(),
  /** Contratos dos fornecedores (view de contratos), extraídos pelo extrair-view.ps1 */
  contratos: z.object({ arquivo: z.string() }).passthrough().optional(),
})

const { values: args } = parseArgs({
  options: {
    config: { type: 'string', default: 'config.json' },
    reprocessar: { type: 'boolean', default: false },
    /** Não espera o arquivo "assentar": usado logo após a extração automática da view, que grava de forma atômica */
    imediato: { type: 'boolean', default: false },
  },
})

const caminhoConfig = resolve(args.config!)
const base = dirname(caminhoConfig)
const config = configSchema.parse(JSON.parse(readFileSync(caminhoConfig, 'utf-8')))
const pastaRelatorios = resolve(base, config.pastaRelatorios)
const caminhoCadastros = resolve(base, config.cadastros)
const saida = resolve(base, config.saida)
const caminhoEstado = join(saida, 'estado.json')
const caminhoLog = join(saida, 'gerador.log')

// Trava: com a pasta de dados (rede) inacessível, não cria nada — o mkdir recursivo recriaria
// uma árvore vazia no lugar errado. Registra num log local, ao lado do config.
if (!existsSync(caminhoCadastros)) {
  const msg = `${new Date().toISOString()} pasta de dados inacessível (${caminhoCadastros} não encontrado): nada foi gerado`
  console.error(msg)
  appendFileSync(join(base, 'acesso.log'), msg + '\n')
  process.exit(1)
}

mkdirSync(join(saida, 'historico'), { recursive: true })

function log(msg: string) {
  const linha = `${new Date().toISOString()} ${msg}`
  console.log(linha)
  appendFileSync(caminhoLog, linha + '\n')
}

/** Grava em arquivo temporário e renomeia: quem abrir o painel no meio da gravação não lê arquivo pela metade. */
function gravarAtomico(caminho: string, conteudo: string) {
  const tmp = `${caminho}.tmp`
  writeFileSync(tmp, conteudo, 'utf-8')
  renameSync(tmp, caminho)
}

function lerEstado(): EstadoImportacao {
  if (args.reprocessar || !existsSync(caminhoEstado)) return { titulos: [], coberturas: [] }
  return JSON.parse(readFileSync(caminhoEstado, 'utf-8')) as EstadoImportacao
}

function listarRelatorios(): string[] {
  if (!existsSync(pastaRelatorios)) throw new Error(`Pasta de relatórios não encontrada: ${pastaRelatorios}`)
  const limite = Date.now() - (args.imediato ? 0 : config.segundosMinimosDesdeAlteracao) * 1000
  return readdirSync(pastaRelatorios)
    .filter((n) => !n.startsWith('~$') && config.extensoes.includes(extname(n).toLowerCase()))
    .map((n) => join(pastaRelatorios, n))
    .filter((c) => statSync(c).isFile() && statSync(c).mtimeMs <= limite)
}

function podarHistorico() {
  const pasta = join(saida, 'historico')
  const arquivos = readdirSync(pasta).filter((n) => n.endsWith('.json')).sort()
  for (const n of arquivos.slice(0, Math.max(0, arquivos.length - config.historicoMaximo))) rmSync(join(pasta, n))
}

try {
  const agora = new Date().toISOString()
  const estado = lerEstado()
  const resultado = importarRelatorios(estado, listarRelatorios().map(arquivoRelatorio), agora)

  for (const p of resultado.processados) log(`importado ${p.arquivo} (${p.layout}): ${p.titulos} títulos, ${p.erros} erros${p.removidos ? `, ${p.removidos} excluídos no Protheus removidos` : ''}`)
  for (const f of resultado.falhas) log(`FALHA ${f.arquivo}: ${f.erro}`)

  const novoEstado: EstadoImportacao = { titulos: resultado.titulos, coberturas: resultado.coberturas }
  if (resultado.processados.length || args.reprocessar) gravarAtomico(caminhoEstado, JSON.stringify(novoEstado))

  const cadastros = lerCadastros(lerBytes(caminhoCadastros))
  const dados = conciliar(cadastros, novoEstado.titulos, novoEstado.coberturas, { geradoEm: agora, origem: 'gerador' })
  dados.falhas = resultado.falhas

  // Solicitações: retrato da última extração (não acumula como os títulos).
  if (config.solicitacoes) {
    const caminhoSol = resolve(base, config.solicitacoes.arquivo)
    if (existsSync(caminhoSol)) {
      const sol = lerSolicitacoes(lerBytes(caminhoSol), caminhoSol)
      for (const e of sol.erros) log(`AVISO solicitações: ${e}`)
      dados.solicitacoes = vincularFornecedores(sol.itens, cadastros.fornecedores)
      dados.solicitacoesGeradoEm = statSync(caminhoSol).mtime.toISOString()
    }
  }

  // Contratos do Protheus: retrato da última extração, com o resumo de pagamentos de cada fornecedor
  // calculado sobre todos os títulos (não só os do cadastro ADM).
  if (config.contratos) {
    const caminhoCt = resolve(base, config.contratos.arquivo)
    if (existsSync(caminhoCt)) {
      const ct = lerContratosProtheus(lerBytes(caminhoCt), caminhoCt)
      for (const e of ct.erros) log(`AVISO contratos: ${e}`)
      const resumo = resumirPagamentos(novoEstado.titulos, new Set(ct.contratos.map((c) => c.codFornecedor)), hojeISO())
      dados.contratosProtheus = ct.contratos.map((c) => ({ ...c, pagamentos: resumo.get(c.codFornecedor) }))
      dados.contratosGeradoEm = statSync(caminhoCt).mtime.toISOString()
    }
  }

  const json = JSON.stringify(dados)
  gravarAtomico(join(saida, 'dados.json'), json)
  gravarAtomico(join(saida, 'dados.js'), `window.__ADM__ = ${json};\n`)

  if (resultado.processados.length || args.reprocessar) {
    writeFileSync(join(saida, 'historico', `dados-${agora.replace(/[:.]/g, '-')}.json`), json, 'utf-8')
    podarHistorico()
  }

  log(`ok: ${dados.titulos.length} títulos no escopo, ${dados.ignorados} ignorados, ${dados.solicitacoes?.length ?? 0} itens de solicitação, ${dados.contratosProtheus?.length ?? 0} contratos, ${resultado.pulados.length} arquivos já importados, ${cadastros.problemas.length} problemas no cadastro`)
} catch (e) {
  log(`ERRO ${(e as Error).stack ?? e}`)
  process.exitCode = 1
}
