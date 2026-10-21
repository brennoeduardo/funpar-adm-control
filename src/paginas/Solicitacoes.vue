<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import * as XLSX from 'xlsx'
import type { Solicitacao } from '@core/tipos'
import { dados, filtros, fornecedorPorCodigo, hoje } from '../estado'
import { contemTexto, data, dataHora, moeda } from '../formato'
import { nomeParaOrdenar, noPeriodo, useOrdenacao } from '../componentes/ordenacao'
import FiltroPeriodo from '../componentes/FiltroPeriodo.vue'

const props = defineProps<{ origem: string; titulo: string; descricao: string }>()

const status = ref('')
const soAdm = ref(false)
/** Período pela data da solicitação */
const de = ref('')
const ate = ref('')
const aberto = ref<Set<string>>(new Set())
watch(() => props.origem, () => {
  status.value = ''
  aberto.value = new Set()
})

const itens = computed(() => (dados.value?.solicitacoes ?? []).filter((s) => s.origem === props.origem))

/** OFs geradas a partir de cada solicitação (mesmo protocolo). */
const ofsPorProtocolo = computed(() => {
  const m = new Map<string, string[]>()
  for (const o of dados.value?.ofs ?? []) {
    if (!o.protocolo || !o.pedido) continue
    const l = m.get(o.protocolo) ?? []
    if (!l.includes(o.pedido)) l.push(o.pedido)
    m.set(o.protocolo, l)
  }
  return m
})

/** Agrupa os itens por solicitação (protocolo) e fornecedor. */
interface Grupo {
  id: string
  protocolo: string | null
  fornecedor: string
  codFornecedor: string | null
  solicitante: string | null
  data: string | null
  status: string
  valor: number
  itens: Solicitacao[]
  centrosCusto: string[]
}
const grupos = computed<Grupo[]>(() => {
  const m = new Map<string, Grupo>()
  for (const s of itens.value) {
    const id = `${s.protocolo ?? '-'}|${s.fornecedor}|${s.status}`
    const g = m.get(id) ?? { id, protocolo: s.protocolo, fornecedor: s.fornecedor, codFornecedor: s.codFornecedor, solicitante: s.solicitante, data: s.data, status: s.status, valor: 0, itens: [], centrosCusto: [] }
    g.valor += s.valor
    g.itens.push(s)
    if (s.centroCusto && !g.centrosCusto.includes(s.centroCusto)) g.centrosCusto.push(s.centroCusto)
    if (s.data && (!g.data || s.data < g.data)) g.data = s.data
    m.set(id, g)
  }
  return [...m.values()].filter((g) => noPeriodo(g.data, de.value, ate.value))
})

const resumo = computed(() => {
  const m = new Map<string, { status: string; qtd: number; valor: number }>()
  for (const g of grupos.value) {
    const r = m.get(g.status) ?? { status: g.status, qtd: 0, valor: 0 }
    r.qtd++
    r.valor += g.valor
    m.set(g.status, r)
  }
  return [...m.values()].sort((a, b) => b.qtd - a.qtd)
})

type Coluna = 'data' | 'protocolo' | 'fornecedor' | 'solicitante' | 'valor' | 'status' | 'centro'
const { ordenar, seta, aplicar } = useOrdenacao<Grupo, Coluna>(
  (g, c) => (c === 'centro' ? g.centrosCusto[0] : c === 'protocolo' ? Number(g.protocolo) || g.protocolo : c === 'fornecedor' ? nomeParaOrdenar(g.fornecedor) : g[c]),
  'data',
  true,
)

const linhas = computed(() => aplicar(filtradas.value))
const filtradas = computed(() =>
  grupos.value.filter((g) => {
    if (status.value && g.status !== status.value) return false
    if (soAdm.value && !g.codFornecedor) return false
    return contemTexto([g.fornecedor, g.protocolo, g.solicitante, ...g.itens.map((i) => i.descricao), ...g.centrosCusto], filtros.busca)
  }),
)
const total = computed(() => linhas.value.reduce((s, g) => s + g.valor, 0))

/** Cor do selo pela fase: concluído, aguardando entrega/compras, aprovação, financeiro/NF, ajuste. */
function estiloStatus(s: string): string {
  if (/PAGO|FINALIZADO/.test(s)) return 'border-[var(--s-pago)]/30 bg-[var(--s-pago-bg)] text-[var(--s-pago)]'
  if (/DEVOLVID|AJUSTE|REPROV|CANCEL/.test(s)) return 'border-[var(--s-vencido)]/30 bg-[var(--s-vencido-bg)] text-[var(--s-vencido)]'
  if (/APROVA|PENDENTE|GESTOR|GERENTE/.test(s)) return 'border-[var(--s-naolancado)]/30 bg-[var(--s-naolancado-bg)] text-[var(--s-naolancado)]'
  if (/FINANCEIRO|NF|NOTA|PAGAMENTO/.test(s)) return 'border-marca-600/30 bg-marca-100 text-marca-700'
  return 'border-[var(--s-lancado)]/30 bg-[var(--s-lancado-bg)] text-[var(--s-lancado)]'
}
const rotuloStatus = (s: string) => s.charAt(0) + s.slice(1).toLowerCase()

function alternar(id: string) {
  const n = new Set(aberto.value)
  if (n.has(id)) n.delete(id)
  else n.add(id)
  aberto.value = n
}

const diasDesde = (d: string | null) => (d ? Math.round((Date.parse(hoje) - Date.parse(d)) / 86_400_000) : null)

function exportar() {
  const ws = XLSX.utils.json_to_sheet(
    linhas.value.flatMap((g) =>
      g.itens.map((i) => ({
        Protocolo: i.protocolo,
        Data: data(i.data),
        Fornecedor: i.fornecedor,
        'Fornecedor ADM': i.codFornecedor ? fornecedorPorCodigo.value.get(i.codFornecedor)?.nome ?? i.codFornecedor : '',
        Solicitante: i.solicitante,
        'Descrição': i.descricao,
        Valor: i.valor,
        'Situação': i.status,
        'Centro de custo': i.centroCusto,
        'Conta contábil': i.contaContabil,
        'Desc. conta contábil': i.descContaContabil,
      })),
    ),
  )
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, props.titulo.slice(0, 31))
  XLSX.writeFile(wb, `${props.titulo.toLowerCase().replace(/[^a-z]+/g, '-')}-${hoje}.xlsx`)
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="!dados?.solicitacoes" class="cartao border-destaque bg-destaque-claro p-5">
      <h2 class="text-base font-bold">Solicitações ainda não carregadas</h2>
      <p class="mt-1 text-sm">
        Esta aba é alimentada pela view de solicitações abertas do Protheus, extraída pela rotina automática a cada 30 minutos. Os dados aparecem após a próxima execução
        (ou rode <code>gerador\atualizar-auto.cmd</code>).
      </p>
    </div>

    <template v-else>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <p class="text-sm text-texto-suave">{{ descricao }} · solicitações abertas extraídas em {{ dataHora(dados.solicitacoesGeradoEm) }}</p>
        <button class="botao-primario" @click="exportar">Exportar para Excel</button>
      </div>

      <!-- Resumo por situação (clique para filtrar) -->
      <div class="flex flex-wrap gap-2">
        <button
          class="rounded-xl border px-3 py-2 text-left transition"
          :class="status === '' ? 'border-marca-600 bg-white shadow' : 'border-slate-200 bg-white/60 hover:bg-white'"
          @click="status = ''"
        >
          <div class="rotulo">Todas</div>
          <div class="text-xl font-extrabold">{{ grupos.length }}</div>
          <div class="text-xs text-texto-suave">{{ moeda(grupos.reduce((s, g) => s + g.valor, 0)) }}</div>
        </button>
        <button
          v-for="r in resumo"
          :key="r.status"
          class="rounded-xl border px-3 py-2 text-left transition"
          :class="status === r.status ? 'border-marca-600 bg-white shadow' : 'border-slate-200 bg-white/60 hover:bg-white'"
          @click="status = status === r.status ? '' : r.status"
        >
          <div class="text-xs font-semibold">
            <span class="rounded-full border px-2 py-0.5" :class="estiloStatus(r.status)">{{ rotuloStatus(r.status) }}</span>
          </div>
          <div class="mt-1 text-xl font-extrabold">{{ r.qtd }}</div>
          <div class="text-xs text-texto-suave">{{ moeda(r.valor) }}</div>
        </button>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <FiltroPeriodo v-model:de="de" v-model:ate="ate" rotulo="Data da solicitação" />
        <label class="flex items-center gap-2 text-sm">
          <input v-model="soAdm" type="checkbox" class="size-4 accent-marca-600" /> Só fornecedores do cadastro ADM
        </label>
        <span class="text-sm text-texto-suave">{{ linhas.length }} solicitações · <strong class="text-marca-700">{{ moeda(total) }}</strong></span>
      </div>

      <div class="cartao overflow-auto" style="max-height: calc(100vh - 360px)">
        <table class="tabela">
          <thead>
            <tr>
              <th class="w-6"></th>
              <th class="cursor-pointer select-none" @click="ordenar('data')">Data{{ seta('data') }}</th>
              <th class="cursor-pointer select-none" @click="ordenar('protocolo')">Protocolo{{ seta('protocolo') }}</th>
              <th class="cursor-pointer select-none" @click="ordenar('fornecedor')">Fornecedor{{ seta('fornecedor') }}</th>
              <th class="cursor-pointer select-none" @click="ordenar('solicitante')">Solicitante{{ seta('solicitante') }}</th>
              <th>Itens</th>
              <th class="num cursor-pointer select-none" @click="ordenar('valor')">Valor{{ seta('valor') }}</th>
              <th class="cursor-pointer select-none" @click="ordenar('status')">Situação{{ seta('status') }}</th>
              <th class="cursor-pointer select-none" @click="ordenar('centro')">Centro de custo{{ seta('centro') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="g in linhas" :key="g.id">
              <tr class="cursor-pointer" @click="alternar(g.id)">
                <td class="text-texto-suave">{{ aberto.has(g.id) ? '▾' : '▸' }}</td>
                <td class="tabular-nums whitespace-nowrap">
                  {{ data(g.data) }}
                  <div v-if="diasDesde(g.data) !== null && diasDesde(g.data)! > 0" class="text-xs text-texto-suave">há {{ diasDesde(g.data) }} d</div>
                </td>
                <td class="tabular-nums">
                  {{ g.protocolo ?? '—' }}
                  <div v-if="g.protocolo && ofsPorProtocolo.get(g.protocolo)" class="text-xs font-semibold text-marca-600" title="Ordem de Fornecimento gerada a partir desta solicitação">
                    OF {{ ofsPorProtocolo.get(g.protocolo)!.join(', ') }}
                  </div>
                </td>
                <td>
                  <div class="font-medium">{{ g.fornecedor }}</div>
                  <span v-if="g.codFornecedor" class="rounded-full bg-marca-100 px-2 py-0.5 text-[11px] font-bold text-marca-700" :title="`Cadastro ADM: ${g.codFornecedor}`">ADM</span>
                </td>
                <td class="text-xs">{{ g.solicitante ?? '—' }}</td>
                <td class="max-w-80">
                  <div class="truncate text-xs" :title="g.itens[0]?.descricao ?? ''">{{ g.itens[0]?.descricao ?? '—' }}</div>
                  <div v-if="g.itens.length > 1" class="text-xs text-texto-suave">+ {{ g.itens.length - 1 }} {{ g.itens.length > 2 ? 'itens' : 'item' }}</div>
                </td>
                <td class="num font-semibold">{{ moeda(g.valor) }}</td>
                <td><span class="rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap" :class="estiloStatus(g.status)">{{ rotuloStatus(g.status) }}</span></td>
                <td class="text-xs">{{ g.centrosCusto.join(', ') || '—' }}</td>
              </tr>
              <tr v-if="aberto.has(g.id)" class="bg-fundo">
                <td></td>
                <td colspan="8" class="p-0">
                  <table class="w-full text-xs">
                    <thead>
                      <tr class="text-left text-texto-suave">
                        <th class="px-3 py-1.5">Descrição</th><th class="px-3 py-1.5">Centro de custo</th><th class="px-3 py-1.5">Conta contábil</th><th class="px-3 py-1.5 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(i, n) in g.itens" :key="n" class="border-t border-slate-200">
                        <td class="px-3 py-1.5">{{ i.descricao ?? '—' }}</td>
                        <td class="px-3 py-1.5">{{ i.centroCusto ?? '—' }}</td>
                        <td class="px-3 py-1.5">{{ i.contaContabil ?? '' }} {{ i.descContaContabil ?? '' }}</td>
                        <td class="px-3 py-1.5 text-right tabular-nums">{{ moeda(i.valor) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </template>
            <tr v-if="!linhas.length"><td colspan="9" class="py-10 text-center text-texto-suave">Nenhuma solicitação com os filtros atuais.</td></tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
