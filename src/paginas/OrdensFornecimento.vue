<script setup lang="ts">
import { computed, ref } from 'vue'
import * as XLSX from 'xlsx'
import { numeroCurto } from '@core/situacao'
import type { ContratoProtheus, ItemOF } from '@core/tipos'
import { diasEntre } from '@core/util'
import { ORIGEM_ATAS, ORIGEM_COMPRAS } from '@core/solicitacoes'
import { dados, detalhe, filtros, fornecedorPorCodigo, hoje } from '../estado'
import { contemTexto, data, dataHora, moeda } from '../formato'
import { nomeParaOrdenar, noPeriodo, useOrdenacao } from '../componentes/ordenacao'
import FiltroPeriodo from '../componentes/FiltroPeriodo.vue'

const origem = ref('')
const status = ref('')
const soAdm = ref(false)
/** OFs pagas/finalizadas já viraram lançamento (aba Lançamentos): ficam escondidas por padrão. */
const comFinalizadas = ref(false)
type Faixa = '' | 'entrega' | 'parcial' | '30' | '60' | 'semcontrato' | 'aemitir'
const faixa = ref<Faixa>('')
const aberto = ref<Set<string>>(new Set())
/** Período pela emissão da OF (para "a emitir", pela data da solicitação) */
const de = ref('')
const ate = ref('')

const finalizada = (s: string) => /PAGO|FINALIZAD/.test(s)

interface OF {
  /** Chave da linha: nº da OF ou, se ainda não emitida, o protocolo da solicitação */
  id: string
  pedido: string | null
  origem: string
  fornecedor: string
  codFornecedor: string | null
  solicitante: string | null
  emissao: string | null
  dias: number | null
  contrato: string | null
  contratoInfo: ContratoProtheus | undefined
  modalidade: string | null
  processo: string | null
  protocolo: string | null
  status: string
  itens: ItemOF[]
  valor: number
  /** % entregue (pelas quantidades), 0 a 100 */
  entregue: number
  centrosCusto: string[]
}

const contratoPorNumero = computed(() => new Map((dados.value?.contratosProtheus ?? []).map((c) => [c.contrato, c])))

const todas = computed<OF[]>(() => {
  const m = new Map<string, OF>()
  for (const i of dados.value?.ofs ?? []) {
    const id = i.pedido ?? `prot:${i.protocolo}`
    let o = m.get(id)
    if (!o) {
      o = {
        id,
        pedido: i.pedido,
        origem: i.origem,
        fornecedor: i.fornecedor,
        codFornecedor: i.codFornecedor,
        solicitante: i.solicitante,
        emissao: i.emissao,
        dias: i.emissao ? diasEntre(i.emissao, hoje) : null,
        contrato: i.contrato,
        contratoInfo: i.contrato ? contratoPorNumero.value.get(i.contrato) : undefined,
        modalidade: i.modalidade,
        processo: i.processo,
        protocolo: i.protocolo,
        status: i.status,
        itens: [],
        valor: 0,
        entregue: 0,
        centrosCusto: [],
      }
      m.set(id, o)
    }
    o.itens.push(i)
    o.valor += i.valorTotal
    if (i.centroCusto && !o.centrosCusto.includes(i.centroCusto)) o.centrosCusto.push(i.centroCusto)
  }
  for (const o of m.values()) {
    const sol = o.itens.reduce((s, i) => s + i.qtdSolicitada, 0)
    const ent = o.itens.reduce((s, i) => s + i.qtdEntregue, 0)
    o.entregue = sol > 0 ? Math.min(100, Math.round((ent / sol) * 100)) : 0
  }
  return [...m.values()]
})

/** Base dos indicadores: respeita origem, finalizadas e "só ADM" (não a faixa nem a situação). */
const base = computed(() =>
  todas.value.filter(
    (o) =>
      (comFinalizadas.value || !finalizada(o.status)) &&
      (!origem.value || o.origem === origem.value) &&
      (!soAdm.value || (o.codFornecedor && fornecedorPorCodigo.value.has(o.codFornecedor))) &&
      noPeriodo(o.emissao ?? o.itens[0]?.dataSolicitacao, de.value, ate.value),
  ),
)

const kpi = computed(() => ({
  total: base.value.filter((o) => o.pedido).length,
  aEmitir: base.value.filter((o) => !o.pedido).length,
  valor: base.value.reduce((s, o) => s + o.valor, 0),
  entrega: base.value.filter((o) => /AGUARDANDO ENTREGA/.test(o.status)).length,
  parcial: base.value.filter((o) => o.entregue > 0 && o.entregue < 100).length,
  d30: base.value.filter((o) => (o.dias ?? 0) > 30).length,
  d60: base.value.filter((o) => (o.dias ?? 0) > 60).length,
  semContrato: base.value.filter((o) => !o.contrato).length,
}))

const situacoes = computed(() => {
  const m = new Map<string, number>()
  for (const o of base.value) m.set(o.status, (m.get(o.status) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
})

type Coluna = 'pedido' | 'emissao' | 'origem' | 'fornecedor' | 'contrato' | 'entregue' | 'valor' | 'status' | 'solicitante'
const { ordenar, seta, aplicar } = useOrdenacao<OF, Coluna>((o, c) => {
  // Sem emissão ("a emitir" ou data vazia no Protheus): fica no fim nos dois sentidos.
  if (c === 'emissao') return o.emissao
  if (c === 'fornecedor') return nomeParaOrdenar(o.fornecedor)
  if (c === 'contrato') return o.contrato ? Number(numeroCurto(o.contrato)) || o.contrato : null
  return o[c]
}, 'emissao')

const linhas = computed(() => aplicar(filtradas.value))
const filtradas = computed(() =>
  base.value.filter((o) => {
    if (status.value && o.status !== status.value) return false
    if (faixa.value === 'entrega' && !/AGUARDANDO ENTREGA/.test(o.status)) return false
    if (faixa.value === 'parcial' && !(o.entregue > 0 && o.entregue < 100)) return false
    if (faixa.value === '30' && !((o.dias ?? 0) > 30)) return false
    if (faixa.value === '60' && !((o.dias ?? 0) > 60)) return false
    if (faixa.value === 'semcontrato' && o.contrato) return false
    if (faixa.value === 'aemitir' && o.pedido) return false
    return contemTexto(
      [o.pedido, o.fornecedor, o.contrato, o.contrato ? numeroCurto(o.contrato) : null, o.protocolo, o.processo, o.solicitante, ...o.itens.map((i) => i.descricao), ...o.centrosCusto],
      filtros.busca,
    )
  }),
)
const totalLinhas = computed(() => linhas.value.reduce((s, o) => s + o.valor, 0))

function estiloStatus(s: string): string {
  if (finalizada(s)) return 'border-[var(--s-pago)]/30 bg-[var(--s-pago-bg)] text-[var(--s-pago)]'
  if (/DEVOLVID|AJUSTE|REPROV|CANCEL/.test(s)) return 'border-[var(--s-vencido)]/30 bg-[var(--s-vencido-bg)] text-[var(--s-vencido)]'
  if (/APROVA|PENDENTE|GESTOR|GERENTE/.test(s)) return 'border-[var(--s-naolancado)]/30 bg-[var(--s-naolancado-bg)] text-[var(--s-naolancado)]'
  if (/FINANCEIRO|NF|NOTA|PAGAMENTO/.test(s)) return 'border-marca-600/30 bg-marca-100 text-marca-700'
  return 'border-[var(--s-lancado)]/30 bg-[var(--s-lancado-bg)] text-[var(--s-lancado)]'
}
const rotulo = (s: string) => s.charAt(0) + s.slice(1).toLowerCase()
const rotuloOrigem = (o: string) => (o === ORIGEM_ATAS ? 'Ata/Contrato' : o === ORIGEM_COMPRAS ? 'Compras' : rotulo(o))

/** Vigência do contrato da OF (pela view de contratos), para alertar OF de contrato perto do fim. */
function vigencia(o: OF): { rotulo: string; classe: string } | null {
  const fim = o.contratoInfo?.fim
  if (!fim) return null
  const d = diasEntre(hoje, fim)
  if (d < 0) return { rotulo: `vencido há ${-d} d`, classe: 'text-[var(--s-vencido)]' }
  if (d <= 90) return { rotulo: `vence em ${d} d`, classe: 'text-[var(--s-naolancado)]' }
  return { rotulo: `até ${data(fim)}`, classe: 'text-texto-suave' }
}

function corIdade(d: number | null): string {
  if (d === null) return 'text-texto-suave'
  if (d > 60) return 'font-semibold text-[var(--s-vencido)]'
  if (d > 30) return 'font-semibold text-[var(--s-naolancado)]'
  return 'text-texto-suave'
}

function alternar(id: string) {
  const n = new Set(aberto.value)
  if (n.has(id)) n.delete(id)
  else n.add(id)
  aberto.value = n
}

function abrirFornecedor(o: OF, e: Event) {
  if (!o.codFornecedor || !fornecedorPorCodigo.value.has(o.codFornecedor)) return
  e.stopPropagation()
  detalhe.value = { tipo: 'fornecedor', codigo: o.codFornecedor }
}

function exportar() {
  const ws = XLSX.utils.json_to_sheet(
    linhas.value.flatMap((o) =>
      o.itens.map((i) => ({
        'OF': o.pedido ?? 'a emitir',
        'Emissão': data(o.emissao),
        'Dias em aberto': o.dias,
        Origem: rotuloOrigem(o.origem),
        Fornecedor: o.fornecedor,
        'Cód. fornecedor': o.codFornecedor,
        Contrato: o.contrato,
        Modalidade: o.modalidade,
        'Processo interno': o.processo,
        Protocolo: o.protocolo,
        Solicitante: o.solicitante,
        'Descrição': i.descricao,
        'Qtd. solicitada': i.qtdSolicitada,
        'Qtd. entregue': i.qtdEntregue,
        'Valor unit.': i.valorUnitario,
        'Valor total': i.valorTotal,
        'Situação': o.status,
        'Centro de custo': i.centroCusto,
        'Conta contábil': [i.contaContabil, i.descContaContabil].filter(Boolean).join(' '),
      })),
    ),
  )
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'OFs abertas')
  XLSX.writeFile(wb, `ordens-fornecimento-${hoje}.xlsx`)
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="!dados?.ofs" class="cartao border-destaque bg-destaque-claro p-5">
      <h2 class="text-base font-bold">Ordens de Fornecimento ainda não carregadas</h2>
      <p class="mt-1 text-sm">
        Esta aba é alimentada pela view de OFs abertas do Protheus, extraída pela rotina automática a cada 30 minutos. Os dados aparecem após a próxima execução.
      </p>
    </div>

    <template v-else>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <p class="text-sm text-texto-suave">
          OFs em aberto: o que ainda não virou lançamento de nota fiscal · extraídas em {{ dataHora(dados.ofsGeradoEm) }}
          <span v-if="dados.ofsOcultas" class="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs" title="Fornecedores configurados em ofs.ocultarFornecedores no config.json do gerador">{{ dados.ofsOcultas }} OFs ocultas por configuração</span>
        </p>
        <button class="botao-primario" @click="exportar">Exportar para Excel</button>
      </div>

      <!-- Indicadores (clique para filtrar) -->
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <button class="cartao p-4 text-left transition" :class="faixa === '' ? 'ring-2 ring-marca-600' : 'hover:border-marca-600'" @click="faixa = ''">
          <div class="rotulo">OFs abertas</div>
          <div class="mt-1 text-3xl font-extrabold">{{ kpi.total }}</div>
          <div class="text-xs text-texto-suave">{{ moeda(kpi.valor) }}</div>
        </button>
        <button class="cartao p-4 text-left transition" :class="faixa === 'entrega' ? 'ring-2 ring-[var(--s-lancado)]' : 'hover:border-[var(--s-lancado)]'" @click="faixa = faixa === 'entrega' ? '' : 'entrega'">
          <div class="rotulo">Aguardando entrega</div>
          <div class="mt-1 text-3xl font-extrabold" style="color: var(--s-lancado)">{{ kpi.entrega }}</div>
        </button>
        <button class="cartao p-4 text-left transition" :class="faixa === 'parcial' ? 'ring-2 ring-marca-600' : 'hover:border-marca-600'" @click="faixa = faixa === 'parcial' ? '' : 'parcial'">
          <div class="rotulo">Entrega parcial</div>
          <div class="mt-1 text-3xl font-extrabold">{{ kpi.parcial }}</div>
        </button>
        <button class="cartao p-4 text-left transition" :class="faixa === '30' ? 'ring-2 ring-[var(--s-naolancado)]' : 'hover:border-[var(--s-naolancado)]'" @click="faixa = faixa === '30' ? '' : '30'">
          <div class="rotulo">Abertas há +30 dias</div>
          <div class="mt-1 text-3xl font-extrabold" style="color: var(--s-naolancado)">{{ kpi.d30 }}</div>
        </button>
        <button class="cartao p-4 text-left transition" :class="faixa === '60' ? 'ring-2 ring-[var(--s-vencido)]' : 'hover:border-[var(--s-vencido)]'" @click="faixa = faixa === '60' ? '' : '60'">
          <div class="rotulo">Abertas há +60 dias</div>
          <div class="mt-1 text-3xl font-extrabold" style="color: var(--s-vencido)">{{ kpi.d60 }}</div>
        </button>
        <button class="cartao p-4 text-left transition" :class="faixa === 'aemitir' ? 'ring-2 ring-[var(--s-naolancado)]' : 'hover:border-[var(--s-naolancado)]'" @click="faixa = faixa === 'aemitir' ? '' : 'aemitir'">
          <div class="rotulo">OF a emitir</div>
          <div class="mt-1 text-3xl font-extrabold" style="color: var(--s-naolancado)">{{ kpi.aEmitir }}</div>
          <div class="text-xs text-texto-suave">solicitações em aprovação</div>
        </button>
        <button class="cartao p-4 text-left transition" :class="faixa === 'semcontrato' ? 'ring-2 ring-marca-600' : 'hover:border-marca-600'" @click="faixa = faixa === 'semcontrato' ? '' : 'semcontrato'">
          <div class="rotulo">Sem contrato</div>
          <div class="mt-1 text-3xl font-extrabold text-texto-suave">{{ kpi.semContrato }}</div>
          <div class="text-xs text-texto-suave">pedido direto</div>
        </button>
      </div>

      <div class="flex flex-wrap items-end gap-3">
        <label class="flex flex-col gap-1">
          <span class="rotulo">Origem</span>
          <select v-model="origem" class="campo">
            <option value="">Todas</option>
            <option :value="ORIGEM_ATAS">Atas e Contratos</option>
            <option :value="ORIGEM_COMPRAS">Formulário de Compras</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="rotulo">Situação</span>
          <select v-model="status" class="campo max-w-80">
            <option value="">Todas</option>
            <option v-for="[s, n] in situacoes" :key="s" :value="s">{{ rotulo(s) }} ({{ n }})</option>
          </select>
        </label>
        <FiltroPeriodo v-model:de="de" v-model:ate="ate" rotulo="Emissão da OF" />
        <label class="flex items-center gap-2 pb-1.5 text-sm">
          <input v-model="soAdm" type="checkbox" class="size-4 accent-marca-600" /> Só fornecedores do cadastro ADM
        </label>
        <label class="flex items-center gap-2 pb-1.5 text-sm">
          <input v-model="comFinalizadas" type="checkbox" class="size-4 accent-marca-600" /> Mostrar pagas/finalizadas
        </label>
        <span class="ml-auto pb-1.5 text-sm text-texto-suave">{{ linhas.length }} OFs · <strong class="text-marca-700">{{ moeda(totalLinhas) }}</strong> · clique no cabeçalho para ordenar</span>
      </div>

      <div class="cartao overflow-auto" style="max-height: calc(100vh - 380px)">
        <table class="tabela">
          <thead>
            <tr>
              <th class="w-6"></th>
              <th class="cursor-pointer select-none" @click="ordenar('pedido')">OF{{ seta('pedido') }}</th>
              <th class="cursor-pointer select-none" @click="ordenar('emissao')">Emissão{{ seta('emissao') }}</th>
              <th class="cursor-pointer select-none" @click="ordenar('origem')">Origem{{ seta('origem') }}</th>
              <th class="cursor-pointer select-none" @click="ordenar('fornecedor')">Fornecedor{{ seta('fornecedor') }}</th>
              <th class="cursor-pointer select-none" @click="ordenar('contrato')">Contrato{{ seta('contrato') }}</th>
              <th>Itens</th>
              <th class="num cursor-pointer select-none" @click="ordenar('entregue')">Entregue{{ seta('entregue') }}</th>
              <th class="num cursor-pointer select-none" @click="ordenar('valor')">Valor{{ seta('valor') }}</th>
              <th class="cursor-pointer select-none" @click="ordenar('status')">Situação{{ seta('status') }}</th>
              <th class="cursor-pointer select-none" @click="ordenar('solicitante')">Solicitante{{ seta('solicitante') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="o in linhas" :key="o.id">
              <tr class="cursor-pointer" @click="alternar(o.id)">
                <td class="text-texto-suave">{{ aberto.has(o.id) ? '▾' : '▸' }}</td>
                <td class="font-semibold tabular-nums">
                  <template v-if="o.pedido">{{ o.pedido }}</template>
                  <span v-else class="rounded-full bg-[var(--s-naolancado-bg)] px-2 py-0.5 text-xs whitespace-nowrap text-[var(--s-naolancado)]" title="Solicitação em aprovação: a OF ainda não foi emitida">a emitir</span>
                  <div v-if="o.modalidade" class="text-xs font-normal text-texto-suave">{{ o.modalidade }}</div></td>
                <td class="tabular-nums whitespace-nowrap">
                  {{ data(o.emissao) }}
                  <div v-if="o.dias !== null" class="text-xs" :class="corIdade(o.dias)">há {{ o.dias }} d</div>
                  <div v-else-if="o.itens[0]?.dataSolicitacao" class="text-xs text-texto-suave" title="OF ainda não emitida: data da solicitação">solic. {{ data(o.itens[0].dataSolicitacao) }}</div>
                </td>
                <td class="text-xs whitespace-nowrap">{{ rotuloOrigem(o.origem) }}</td>
                <td>
                  <button
                    class="text-left font-medium"
                    :class="o.codFornecedor && fornecedorPorCodigo.has(o.codFornecedor) ? 'hover:text-marca-600 hover:underline' : 'cursor-default'"
                    @click="abrirFornecedor(o, $event)"
                  >{{ o.fornecedor }}</button>
                  <span v-if="o.codFornecedor && fornecedorPorCodigo.has(o.codFornecedor)" class="ml-1 rounded-full bg-marca-100 px-1.5 py-0.5 text-[10px] font-bold text-marca-700">ADM</span>
                </td>
                <td class="text-xs whitespace-nowrap">
                  <template v-if="o.contrato">
                    <span class="font-semibold tabular-nums">{{ numeroCurto(o.contrato) }}</span>
                    <div v-if="vigencia(o)" :class="vigencia(o)!.classe">{{ vigencia(o)!.rotulo }}</div>
                  </template>
                  <span v-else class="text-texto-suave">—</span>
                </td>
                <td class="max-w-72">
                  <div class="truncate text-xs" :title="o.itens[0]?.descricao ?? ''">{{ o.itens[0]?.descricao ?? '—' }}</div>
                  <div v-if="o.itens.length > 1" class="text-xs text-texto-suave">+ {{ o.itens.length - 1 }} {{ o.itens.length > 2 ? 'itens' : 'item' }}</div>
                </td>
                <td class="num">
                  <div class="ml-auto h-1.5 w-16 overflow-hidden rounded-full bg-slate-200"><div class="h-full rounded-full bg-[var(--s-pago)]" :style="{ width: `${o.entregue}%` }"></div></div>
                  <div class="text-xs text-texto-suave">{{ o.entregue }}%</div>
                </td>
                <td class="num font-semibold">{{ moeda(o.valor) }}</td>
                <td><span class="rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap" :class="estiloStatus(o.status)">{{ rotulo(o.status) }}</span></td>
                <td class="text-xs">{{ o.solicitante ?? '—' }}</td>
              </tr>
              <tr v-if="aberto.has(o.id)" class="bg-fundo">
                <td></td>
                <td colspan="10" class="p-0">
                  <div class="flex flex-wrap gap-x-6 gap-y-1 px-3 pt-2 text-xs text-texto-suave">
                    <span>Protocolo da solicitação: <strong class="text-marca-700">{{ o.protocolo ?? '—' }}</strong></span>
                    <span v-if="o.processo">Processo interno: <strong class="text-marca-700">{{ o.processo }}</strong></span>
                    <span v-if="o.contratoInfo">Objeto do contrato: <strong class="text-marca-700">{{ o.contratoInfo.objeto?.slice(0, 120) }}</strong></span>
                  </div>
                  <table class="mt-1 w-full text-xs">
                    <thead>
                      <tr class="text-left text-texto-suave">
                        <th class="px-3 py-1.5">Descrição</th><th class="px-3 py-1.5 text-right">Qtd. solicitada</th><th class="px-3 py-1.5 text-right">Qtd. entregue</th>
                        <th class="px-3 py-1.5 text-right">Valor unit.</th><th class="px-3 py-1.5 text-right">Valor total</th><th class="px-3 py-1.5">Centro de custo</th><th class="px-3 py-1.5">Conta contábil</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(i, n) in o.itens" :key="n" class="border-t border-slate-200">
                        <td class="px-3 py-1.5">{{ i.descricao ?? '—' }}</td>
                        <td class="px-3 py-1.5 text-right tabular-nums">{{ i.qtdSolicitada.toLocaleString('pt-BR') }}</td>
                        <td class="px-3 py-1.5 text-right tabular-nums" :class="i.qtdEntregue > 0 ? 'font-semibold text-[var(--s-pago)]' : ''">{{ i.qtdEntregue.toLocaleString('pt-BR') }}</td>
                        <td class="px-3 py-1.5 text-right tabular-nums">{{ moeda(i.valorUnitario) }}</td>
                        <td class="px-3 py-1.5 text-right tabular-nums">{{ moeda(i.valorTotal) }}</td>
                        <td class="px-3 py-1.5">{{ i.centroCusto ?? '—' }}</td>
                        <td class="px-3 py-1.5">{{ i.contaContabil ?? '' }} {{ i.descContaContabil ?? '' }}</td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </template>
            <tr v-if="!linhas.length"><td colspan="11" class="py-10 text-center text-texto-suave">Nenhuma OF com os filtros atuais.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="text-xs text-texto-suave">
        Dias em aberto contados da emissão da OF. % entregue pelas quantidades dos itens. A vigência do contrato vem da aba Contratos (quando o contrato está lá).
      </p>
    </template>
  </div>
</template>
