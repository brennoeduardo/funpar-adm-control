<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { dados, detalhe, EM_BREVE, filtros, irPara, pagina, PAGINAS, recarregando, recarregarDados, somenteBaixados, type PaginaId } from './estado'
import { data, dataHora } from './formato'
import PainelDetalhe from './componentes/PainelDetalhe.vue'
import Icone from './componentes/Icone.vue'
import Painel from './paginas/Painel.vue'
import VisaoMensal from './paginas/VisaoMensal.vue'
import Pagamentos from './paginas/Pagamentos.vue'
import Fornecedores from './paginas/Fornecedores.vue'
import Importacoes from './paginas/Importacoes.vue'
import Solicitacoes from './paginas/Solicitacoes.vue'
import ContratosProtheus from './paginas/ContratosProtheus.vue'
import OrdensFornecimento from './paginas/OrdensFornecimento.vue'
import { ORIGEM_ATAS, ORIGEM_COMPRAS } from '@core/solicitacoes'

const componentes = { painel: Painel, mensal: VisaoMensal, pagamentos: Pagamentos, contratos: ContratosProtheus, of: OrdensFornecimento, fornecedores: Fornecedores, importacoes: Importacoes }
const ehSolicitacao = computed(() => !!dados.value && (pagina.value === 'atas' || pagina.value === 'compras'))
const atual = computed(() => (!dados.value ? Importacoes : pagina.value === 'atas' || pagina.value === 'compras' ? null : componentes[pagina.value]))

const cobertura = computed(() => {
  const c = dados.value?.coberturas ?? []
  const baixas = c.filter((x) => x.baixaIni).map((x) => [x.baixaIni!, x.baixaFim!] as const)
  if (!baixas.length) return null
  const ini = baixas.map((b) => b[0]).sort()[0]
  const fim = baixas.map((b) => b[1]).sort().at(-1)
  return `${data(ini)} a ${data(fim)}`
})
// Botão de recarregar: busca o dados.js mais recente gerado pela rotina automática.
const aviso = ref('')
let timerAviso: ReturnType<typeof setTimeout> | undefined
async function recarregar() {
  const r = await recarregarDados()
  aviso.value = r === 'novos' ? 'Dados atualizados' : r === 'iguais' ? 'Já está atualizado' : 'Não foi possível ler os dados'
  clearTimeout(timerAviso)
  timerAviso = setTimeout(() => (aviso.value = ''), 3000)
}

// "há X min" ao lado da data dos dados
const agora = ref(Date.now())
const relogio = setInterval(() => (agora.value = Date.now()), 30_000)
onBeforeUnmount(() => clearInterval(relogio))
const idade = computed(() => {
  if (!dados.value) return ''
  const min = Math.max(0, Math.round((agora.value - new Date(dados.value.geradoEm).getTime()) / 60_000))
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  return h < 24 ? `há ${h} h` : `há ${Math.floor(h / 24)} d`
})

// ---------- Menu lateral ----------
const CHAVE_MENU = 'funpar-adm-control:menu-recolhido'
function lerRecolhido(): boolean {
  try {
    return localStorage.getItem(CHAVE_MENU) === '1'
  } catch {
    return false
  }
}
const recolhido = ref(lerRecolhido())
function alternarMenu() {
  recolhido.value = !recolhido.value
  try {
    localStorage.setItem(CHAVE_MENU, recolhido.value ? '1' : '0')
  } catch {
    /* sem armazenamento: só não lembra a preferência */
  }
}
/** Em telas estreitas o menu vira uma gaveta aberta pelo botão ☰ */
const gavetaAberta = ref(false)
/** Rótulos aparecem com o menu expandido ou com a gaveta aberta */
const comRotulos = computed(() => !recolhido.value || gavetaAberta.value)
function navegar(id: string) {
  irPara(id as PaginaId)
  gavetaAberta.value = false
}

type ItemMenu = { id: string; titulo: string; grupo: string; emBreve?: boolean }
const grupos = computed(() => {
  const itens: ItemMenu[] = [...PAGINAS, ...EM_BREVE.map((e) => ({ ...e, emBreve: true }))]
  return ['Acompanhamento', 'Solicitações', 'Cadastro', 'Sistema'].map((g) => ({ nome: g, itens: itens.filter((i) => i.grupo === g) }))
})
const tituloPagina = computed(() => PAGINAS.find((p) => p.id === pagina.value)?.titulo ?? '')

const comFiltros = computed(() => ['painel', 'mensal', 'pagamentos', 'atas', 'compras', 'of', 'contratos', 'fornecedores'].includes(pagina.value))
</script>

<template>
  <div class="flex min-h-screen">
    <!-- Fundo escuro da gaveta (telas estreitas) -->
    <div v-if="gavetaAberta" class="fixed inset-0 z-30 bg-marca-900/50 lg:hidden" @click="gavetaAberta = false"></div>

    <!-- Menu lateral -->
    <aside
      class="fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-gradient-to-b from-marca-900 via-marca-800 to-marca-700 text-white shadow-xl transition-all duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0"
      :class="[recolhido ? 'lg:w-[4.5rem]' : 'lg:w-64', gavetaAberta ? 'translate-x-0' : '-translate-x-full']"
    >
      <div class="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5">
        <span class="h-8 w-1.5 shrink-0 rounded-full bg-destaque"></span>
        <div v-if="comRotulos" class="min-w-0">
          <div class="font-titulo text-lg font-black leading-tight text-white">funpar</div>
          <div class="text-xs font-semibold text-destaque">ADM Control</div>
        </div>
      </div>

      <nav class="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        <div v-for="g in grupos" :key="g.nome">
          <div v-if="comRotulos" class="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-widest text-marca-200">{{ g.nome }}</div>
          <div v-else class="mx-2 mb-2 border-t border-white/15"></div>
          <ul class="space-y-1">
            <li v-for="i in g.itens" :key="i.id">
              <button
                v-if="!i.emBreve"
                class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition"
                :class="pagina === i.id ? 'bg-destaque text-marca-700 shadow' : 'text-white/85 hover:bg-white/10 hover:text-white'"
                :title="comRotulos ? undefined : i.titulo"
                @click="navegar(i.id)"
              >
                <Icone :nome="i.id" class="size-5 shrink-0" />
                <span v-if="comRotulos" class="truncate">{{ i.titulo }}</span>
              </button>
              <div
                v-else
                class="flex w-full cursor-default items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-white/40"
                :title="`${i.titulo}: em breve (aguardando a view da TI)`"
              >
                <Icone :nome="i.id" class="size-5 shrink-0" />
                <span v-if="comRotulos" class="truncate">{{ i.titulo }}</span>
              </div>
            </li>
          </ul>
        </div>
      </nav>

      <!-- Situação dos dados + recarregar -->
      <div v-if="dados" class="shrink-0 border-t border-white/10 p-3">
        <div v-if="comRotulos" class="mb-2 px-1 text-xs leading-snug text-marca-100">
          <div>Dados de <strong class="text-white">{{ dataHora(dados.geradoEm) }}</strong></div>
          <div class="text-marca-200">
            {{ idade }}<span v-if="dados.origem === 'manual'" class="ml-1 rounded-full bg-destaque px-1.5 font-bold text-marca-700">manual</span>
          </div>
          <div v-if="aviso" class="mt-1 font-semibold text-destaque">{{ aviso }}</div>
          <div v-else-if="cobertura" class="mt-1 text-marca-200">Baixas de {{ cobertura }}</div>
        </div>
        <button
          class="flex w-full items-center justify-center gap-2 rounded-xl border border-white/25 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
          :title="`Recarregar os dados (${dataHora(dados.geradoEm)}, ${idade}). A rotina automática atualiza a cada 30 minutos.`"
          :disabled="recarregando"
          @click="recarregar"
        >
          <Icone nome="recarregar" class="size-4" :class="recarregando ? 'animate-spin' : ''" />
          <span v-if="comRotulos">Recarregar</span>
        </button>
      </div>

      <button
        class="hidden h-10 shrink-0 items-center justify-center border-t border-white/10 text-white/60 transition hover:bg-white/10 hover:text-white lg:flex"
        :title="recolhido ? 'Expandir menu' : 'Recolher menu'"
        @click="alternarMenu"
      >
        <Icone :nome="recolhido ? 'expandir' : 'recolher'" class="size-5" />
      </button>
    </aside>

    <!-- Conteúdo -->
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div class="flex h-16 items-center gap-4 px-4 lg:px-6">
          <button class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-marca-700 hover:bg-marca-50 lg:hidden" title="Menu" @click="gavetaAberta = true">
            <Icone nome="menu" class="size-6" />
          </button>
          <h1 class="truncate text-xl font-bold">{{ dados ? tituloPagina : 'Importações' }}</h1>
          <input
            v-if="dados && comFiltros"
            v-model="filtros.busca"
            type="search"
            class="campo ml-auto w-full max-w-md"
            placeholder="Pesquisar fornecedor, CNPJ, código, nº do título, protocolo…"
          />
        </div>
        <div v-if="dados && somenteBaixados" class="border-t border-destaque/60 bg-destaque-claro px-4 py-2 text-sm text-marca-700 lg:px-6">
          Os relatórios importados trazem <strong>apenas títulos pagos</strong>, então não dá para saber o que foi lançado e ainda não foi pago.
          “Sem registro” significa só que nenhum pagamento foi encontrado. Para ver <strong>lançado / não lançado</strong>, importe um relatório com os títulos em aberto também.
        </div>
      </header>

      <main class="mx-auto w-full max-w-[1600px] px-4 py-5 lg:px-6">
        <Solicitacoes
          v-if="ehSolicitacao && pagina === 'atas'"
          :origem="ORIGEM_ATAS"
          titulo="Atas/Contratos"
          descricao="Solicitações geradas a partir de ata ou contrato"
        />
        <Solicitacoes
          v-else-if="ehSolicitacao && pagina === 'compras'"
          :origem="ORIGEM_COMPRAS"
          titulo="Compras"
          descricao="Solicitações do formulário de compras (pedido direto)"
        />
        <component :is="atual" v-else />
      </main>
    </div>

    <PainelDetalhe v-if="detalhe" />
  </div>
</template>
