import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { conciliar, importarRelatorios, lerCadastros, type ArquivoRelatorio, type Cadastros, type DadosADM, type Titulo, type TituloVinculado } from '@core/index'
import { competenciaCoberta, montarMatriz, type LinhaMatriz, type Situacao } from '@core/situacao'
import { ofsAbertasPorFornecedor, ofsDaCompetencia, type OFAberta } from '@core/ofs'
import { competenciaDe, hojeISO, somarMeses } from '@core/util'
import { contemTexto } from './formato'

declare global {
  interface Window {
    __ADM__?: DadosADM
  }
}

export const hoje = hojeISO()

/** Dados vindos do gerador (dados.js) ou da importação manual. */
export const dados = shallowRef<DadosADM | null>(window.__ADM__ ?? null)

// ---------- Navegação (hash, para funcionar abrindo o HTML direto do G:) ----------
export const PAGINAS = [
  { id: 'painel', titulo: 'Painel', grupo: 'Acompanhamento' },
  { id: 'mensal', titulo: 'Visão mensal', grupo: 'Acompanhamento' },
  { id: 'pagamentos', titulo: 'Lançamentos', grupo: 'Acompanhamento' },
  { id: 'atas', titulo: 'Atas/Contratos', grupo: 'Solicitações' },
  { id: 'compras', titulo: 'Compras', grupo: 'Solicitações' },
  { id: 'of', titulo: 'Ordens de Fornecimento', grupo: 'Solicitações' },
  { id: 'contratos', titulo: 'Contratos', grupo: 'Cadastro' },
  { id: 'fornecedores', titulo: 'Fornecedores', grupo: 'Cadastro' },
  { id: 'importacoes', titulo: 'Importações', grupo: 'Sistema' },
] as const

/** Itens do menu que ainda não existem (aparecem como "em breve"). */
export const EM_BREVE: { id: string; titulo: string; grupo: string }[] = []
export type PaginaId = (typeof PAGINAS)[number]['id']

function paginaDoHash(): PaginaId {
  const h = location.hash.replace('#/', '').replace('#', '')
  return (PAGINAS.find((p) => p.id === h)?.id ?? 'painel') as PaginaId
}
export const pagina = ref<PaginaId>(paginaDoHash())
window.addEventListener('hashchange', () => (pagina.value = paginaDoHash()))
export function irPara(p: PaginaId) {
  location.hash = `#/${p}`
}

// ---------- Filtros ----------

export interface Filtros {
  ano: number
  competencia: string
  busca: string
}

function competenciaPadrao(d: DadosADM | null): string {
  // Última competência coberta pelos relatórios; senão o mês anterior ao atual.
  const atual = competenciaDe(hoje)!
  if (d) {
    for (let i = 0; i < 24; i++) {
      const c = somarMeses(atual, -i)
      if (competenciaCoberta(c, d.coberturas)) return c
    }
  }
  return somarMeses(atual, -1)
}

function filtrosIniciais(): Filtros {
  const comp = competenciaPadrao(dados.value)
  // Competência/ano não são lembrados: devem acompanhar os dados mais recentes.
  return { ano: Number(comp.slice(0, 4)), competencia: comp, busca: '' }
}

export const filtros = reactive<Filtros>(filtrosIniciais())
watch(dados, (d, anterior) => {
  // Só reposiciona a competência quando os dados chegam pela primeira vez;
  // ao recarregar, quem está olhando outro mês continua nele.
  if (anterior) return
  const c = competenciaPadrao(d)
  filtros.competencia = c
  filtros.ano = Number(c.slice(0, 4))
})

// ---------- Recarregar dados (sem sair da tela) ----------
const CAMINHO_DADOS = './dados/gerado/dados.js'
const VERIFICAR_A_CADA_MS = 5 * 60 * 1000

export const recarregando = ref(false)
export const ultimaVerificacao = ref<Date>(new Date())

/**
 * Busca de novo o dados.js gerado pela rotina automática. Funciona abrindo o HTML direto do G:,
 * porque é um <script> comum. Devolve 'novos', 'iguais' ou 'erro'.
 */
export function recarregarDados(): Promise<'novos' | 'iguais' | 'erro'> {
  // Virou o dia com a página aberta: recarrega tudo para "hoje" e os vencimentos ficarem certos.
  if (hojeISO() !== hoje) {
    location.reload()
    return Promise.resolve('novos')
  }
  recarregando.value = true
  return new Promise((resolver) => {
    const s = document.createElement('script')
    s.src = `${CAMINHO_DADOS}?t=${Date.now()}`
    const terminar = (r: 'novos' | 'iguais' | 'erro') => {
      s.remove()
      recarregando.value = false
      ultimaVerificacao.value = new Date()
      resolver(r)
    }
    s.onload = () => {
      const novo = window.__ADM__
      if (!novo) return terminar('erro')
      // Só troca se o gerador tiver algo mais novo (também preserva uma importação manual mais recente).
      if (dados.value && novo.geradoEm <= dados.value.geradoEm) return terminar('iguais')
      dados.value = novo
      terminar('novos')
    }
    s.onerror = () => terminar('erro')
    document.head.appendChild(s)
  })
}

setInterval(() => {
  if (!document.hidden && !recarregando.value) void recarregarDados()
}, VERIFICAR_A_CADA_MS)

// ---------- Derivados ----------
export const anosDisponiveis = computed(() => {
  const anos = new Set<number>([Number(hoje.slice(0, 4)), filtros.ano])
  for (const t of dados.value?.titulos ?? []) if (t.competencia) anos.add(Number(t.competencia.slice(0, 4)))
  return [...anos].sort((a, b) => b - a)
})

export const fornecedorPorCodigo = computed(() => new Map((dados.value?.fornecedores ?? []).map((f) => [f.codigo, f])))

/** Pesquisa global aplicada às linhas da matriz (fornecedores). */
export function filtrarLinhas(linhas: LinhaMatriz[]): LinhaMatriz[] {
  return linhas.filter((l) =>
    contemTexto([l.fornecedor.nome, l.fornecedor.razaoSocial, l.fornecedor.cnpj, l.fornecedor.codigo, l.fornecedor.solicitante], filtros.busca),
  )
}

/** Pesquisa global aplicada a um título. */
export function passaFiltroTitulo(t: TituloVinculado): boolean {
  const f = fornecedorPorCodigo.value.get(t.fornecedor)
  return contemTexto([t.razaoSocial, f?.nome, t.cnpj, t.fornecedor, t.numero, t.protocolo, t.historico], filtros.busca)
}

export const matrizAno = computed(() => {
  const d = dados.value
  if (!d) return []
  const comps = Array.from({ length: 12 }, (_, i) => `${filtros.ano}-${String(i + 1).padStart(2, '0')}`)
  return montarMatriz(d, comps, hoje)
})

/** OFs abertas (emitidas, não finalizadas) por código de fornecedor. */
export const ofsAbertas = computed(() => ofsAbertasPorFornecedor(dados.value?.ofs ?? []))

/** Situações em que vale avisar "já tem OF": a nota ainda não foi lançada. */
const PENDENTE_DE_NF: Situacao[] = ['nao_lancado', 'sem_registro', 'fora_cobertura']

/**
 * OFs abertas de um fornecedor que valem para a competência, só quando a célula ainda está sem lançamento.
 * Ponto único para evoluir o selo: OF → NF recebida (view de notas importadas) → pronto para lançar.
 */
export function ofsParaSinalizar(codFornecedor: string, competencia: string, situacao: Situacao): OFAberta[] {
  if (!PENDENTE_DE_NF.includes(situacao)) return []
  return ofsDaCompetencia(ofsAbertas.value.get(codFornecedor), competencia)
}

export const somenteBaixados = computed(() => {
  const cob = dados.value?.coberturas ?? []
  return cob.length > 0 && !cob.some((c) => c.tipo !== 'baixados')
})

// ---------- Painel lateral de detalhe ----------
export type Detalhe =
  | { tipo: 'titulo'; chave: string }
  | { tipo: 'celula'; linhaId: string; competencia: string }
  | { tipo: 'fornecedor'; codigo: string }
export const detalhe = ref<Detalhe | null>(null)

// ---------- Importação manual (contingência: tudo no navegador) ----------
async function hashDe(bytes: Uint8Array, f: File): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return `${f.name}|${f.size}|${f.lastModified}`
  }
}

export interface ResumoImportacaoManual {
  cadastros: string
  processados: string[]
  falhas: string[]
}

/**
 * Processa no navegador os arquivos escolhidos. O cadastros.xlsx é reconhecido pelas abas
 * Fornecedores/Contratos; se não for enviado, reaproveita os cadastros já carregados.
 * Os títulos e coberturas atuais são mantidos e os novos são mesclados sem duplicar.
 */
export async function importarManual(arquivos: File[]): Promise<ResumoImportacaoManual> {
  let cadastros: Cadastros | null = null
  let nomeCadastros = ''
  const relatorios: ArquivoRelatorio[] = []
  for (const f of arquivos) {
    const bytes = new Uint8Array(await f.arrayBuffer())
    if (/cadastro/i.test(f.name)) {
      cadastros = lerCadastros(bytes, f.name)
      nomeCadastros = f.name
      continue
    }
    relatorios.push({ nome: f.name, bytes, geradoEm: new Date(f.lastModified).toISOString(), hash: await hashDe(bytes, f) })
  }

  const atual = dados.value
  if (!cadastros) {
    if (!atual) throw new Error('Selecione também o arquivo cadastros.xlsx')
    cadastros = { fornecedores: atual.fornecedores, contratos: atual.contratos, rateios: atual.rateios, ajustes: atual.ajustes, problemas: atual.problemas }
    nomeCadastros = 'cadastros já carregados'
  }
  const anteriores: Titulo[] = atual?.titulos ?? []
  const r = importarRelatorios({ titulos: anteriores, coberturas: atual?.coberturas ?? [] }, relatorios, new Date().toISOString())
  const novo = conciliar(cadastros, r.titulos, r.coberturas, { geradoEm: new Date().toISOString(), origem: 'manual' })
  novo.falhas = r.falhas
  // A importação manual não traz solicitações: mantém as que já estavam carregadas.
  novo.solicitacoes = atual?.solicitacoes
  novo.solicitacoesGeradoEm = atual?.solicitacoesGeradoEm ?? null
  novo.contratosProtheus = atual?.contratosProtheus
  novo.contratosGeradoEm = atual?.contratosGeradoEm ?? null
  novo.ofs = atual?.ofs
  novo.ofsGeradoEm = atual?.ofsGeradoEm ?? null
  novo.ofsOcultas = atual?.ofsOcultas
  dados.value = novo
  return {
    cadastros: nomeCadastros,
    processados: [...r.processados.map((p) => `${p.arquivo}: ${p.titulos} títulos`), ...r.pulados.map((p) => `${p}: já importado`)],
    falhas: r.falhas.map((f) => `${f.arquivo}: ${f.erro}`),
  }
}
