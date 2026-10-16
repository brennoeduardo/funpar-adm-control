<script setup lang="ts">
import { computed } from 'vue'
import { lancamentosCobertos, montarMatriz, ROTULO_SITUACAO, situacaoDosTitulos, type Situacao } from '@core/situacao'
import type { TituloVinculado } from '@core/tipos'
import { competenciaDe, somarMeses } from '@core/util'
import { dados, detalhe, filtrarLinhas, filtros, fornecedorPorCodigo, hoje, irPara, passaFiltroTitulo, somenteBaixados } from '../estado'
import { compCurta, compLonga, data, moeda } from '../formato'
import { ESTILO_SITUACAO } from '../componentes/estilos'
import SituacaoSelo from '../componentes/SituacaoSelo.vue'

const d = computed(() => dados.value!)

const competencias = computed(() => {
  const atual = competenciaDe(hoje)!
  return Array.from({ length: 18 }, (_, i) => somarMeses(atual, -i))
})

const linhas = computed(() => filtrarLinhas(montarMatriz(d.value, [filtros.competencia], hoje)))
const celula = (l: (typeof linhas.value)[number]) => l.celulas[filtros.competencia]!
const previstos = computed(() => linhas.value.filter((l) => celula(l).situacao !== 'nao_previsto'))
const cobreLancamento = computed(() => lancamentosCobertos(filtros.competencia, d.value.coberturas))

const contagem = computed(() => {
  const c: Partial<Record<Situacao, number>> = {}
  for (const l of previstos.value) c[celula(l).situacao] = (c[celula(l).situacao] ?? 0) + 1
  return c
})
const barra = computed(() => {
  const total = previstos.value.length || 1
  return (['pago', 'lancado', 'vencido', 'nao_lancado', 'sem_registro', 'fora_cobertura', 'futuro'] as Situacao[])
    .filter((s) => (contagem.value[s] ?? 0) > 0)
    .map((s) => ({ s, n: contagem.value[s]!, pct: (contagem.value[s]! / total) * 100 }))
})

const titulosMes = computed(() => d.value.titulos.filter((t) => t.competencia === filtros.competencia && passaFiltroTitulo(t)))
const valorLancado = computed(() => titulosMes.value.reduce((s, t) => s + t.valor, 0))
const valorPago = computed(() => titulosMes.value.filter((t) => t.baixa && t.saldo <= 0).reduce((s, t) => s + t.valor, 0))

/** Fornecedores da competência que ainda pedem atenção (tudo que não está pago). */
const pendentes = computed(() => previstos.value.filter((l) => celula(l).situacao !== 'pago'))

/** Títulos lançados e ainda não pagos, de qualquer competência. */
const aPagar = computed(() =>
  d.value.titulos
    .filter((t) => (t.saldo > 0 || !t.baixa) && passaFiltroTitulo(t))
    .sort((a, b) => (a.vencimentoReal ?? '').localeCompare(b.vencimentoReal ?? '')),
)

const ultimosLancados = computed(() =>
  d.value.titulos
    .filter(passaFiltroTitulo)
    .sort((a, b) => (b.lancamento ?? b.emissao ?? '').localeCompare(a.lancamento ?? a.emissao ?? ''))
    .slice(0, 12),
)

const nome = (t: TituloVinculado) => fornecedorPorCodigo.value.get(t.fornecedor)?.nome ?? t.razaoSocial
const situacaoTitulo = (t: TituloVinculado) => situacaoDosTitulos([t], hoje)!
</script>

<template>
  <div class="space-y-5">
    <!-- Indicadores da competência -->
    <section class="cartao p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-lg font-bold">Competência de {{ compLonga(filtros.competencia) }}</h2>
        <select v-model="filtros.competencia" class="campo">
          <option v-for="c in competencias" :key="c" :value="c">{{ compCurta(c) }}</option>
        </select>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        <div class="rounded-lg bg-marca-50 p-3">
          <div class="rotulo">Fornecedores previstos</div>
          <div class="mt-1 text-3xl font-extrabold">{{ previstos.length }}</div>
        </div>
        <div class="rounded-lg p-3" style="background: var(--s-pago-bg)">
          <div class="rotulo">Lançados e pagos</div>
          <div class="mt-1 text-3xl font-extrabold" style="color: var(--s-pago)">{{ contagem.pago ?? 0 }}</div>
        </div>
        <div class="rounded-lg p-3" style="background: var(--s-lancado-bg)">
          <div class="rotulo">Lançados a pagar</div>
          <div class="mt-1 text-3xl font-extrabold" style="color: var(--s-lancado)">{{ somenteBaixados ? '—' : (contagem.lancado ?? 0) }}</div>
        </div>
        <div class="rounded-lg p-3" style="background: var(--s-vencido-bg)">
          <div class="rotulo">Lançados vencidos</div>
          <div class="mt-1 text-3xl font-extrabold" style="color: var(--s-vencido)">{{ somenteBaixados ? '—' : (contagem.vencido ?? 0) }}</div>
        </div>
        <div class="rounded-lg p-3" :style="{ background: cobreLancamento ? 'var(--s-naolancado-bg)' : 'var(--s-sem-bg)' }">
          <div class="rotulo">{{ cobreLancamento ? 'Não lançados' : 'Sem registro' }}</div>
          <div class="mt-1 text-3xl font-extrabold" :style="{ color: cobreLancamento ? 'var(--s-naolancado)' : 'var(--s-sem)' }">
            {{ cobreLancamento ? (contagem.nao_lancado ?? 0) : (contagem.sem_registro ?? 0) + (contagem.fora_cobertura ?? 0) }}
          </div>
        </div>
        <div class="rounded-lg bg-marca-50 p-3">
          <div class="rotulo">Valor lançado</div>
          <div class="mt-1 text-xl font-extrabold">{{ moeda(valorLancado) }}</div>
        </div>
        <div class="rounded-lg bg-marca-50 p-3">
          <div class="rotulo">Valor pago</div>
          <div class="mt-1 text-xl font-extrabold" style="color: var(--s-pago)">{{ moeda(valorPago) }}</div>
        </div>
      </div>

      <div class="mt-5">
        <div class="flex h-7 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            v-for="b in barra"
            :key="b.s"
            class="flex items-center justify-center text-xs font-bold"
            :style="{
              // Proporcional à quantidade, mas com largura mínima para o número caber mesmo em faixas pequenas.
              flex: `${b.n} 1 0`,
              minWidth: '2rem',
              background: ESTILO_SITUACAO[b.s].fundo,
              color: ESTILO_SITUACAO[b.s].cor,
              borderRight: '2px solid white',
            }"
            :title="`${ROTULO_SITUACAO[b.s]}: ${b.n}`"
          >
            {{ b.n }}
          </div>
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span v-for="b in barra" :key="b.s" class="flex items-center gap-1"><SituacaoSelo :situacao="b.s" /><span class="text-xs text-texto-suave">{{ b.n }}</span></span>
        </div>
      </div>

      <h3 class="mt-6 mb-2 text-base font-bold">Fornecedores pendentes na competência</h3>
      <div class="max-h-96 overflow-auto rounded-lg border border-slate-200">
        <table class="tabela">
          <thead>
            <tr><th>Fornecedor</th><th>Situação</th><th class="num">Títulos</th><th class="num">Valor lançado</th><th>Vencimento</th></tr>
          </thead>
          <tbody>
            <tr v-for="l in pendentes" :key="l.id" class="cursor-pointer" @click="detalhe = { tipo: 'celula', linhaId: l.id, competencia: filtros.competencia }">
              <td class="font-medium">{{ l.fornecedor.nome }}</td>
              <td><SituacaoSelo :situacao="celula(l).situacao" /></td>
              <td class="num">{{ celula(l).titulos.length || '—' }}</td>
              <td class="num">{{ celula(l).valor ? moeda(celula(l).valor) : '—' }}</td>
              <td class="tabular-nums">{{ data(celula(l).titulos.map((t) => t.vencimentoReal).filter(Boolean).sort()[0]) }}</td>
            </tr>
            <tr v-if="!pendentes.length"><td colspan="5" class="py-6 text-center text-texto-suave">Todos os fornecedores previstos estão lançados e pagos.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="mt-2 text-xs text-texto-suave">Clique num fornecedor para ver os títulos. A competência de cada título é o mês da emissão.</p>
    </section>

    <section class="grid gap-5 xl:grid-cols-2">
      <div class="cartao p-5">
        <h2 class="text-base font-bold">Lançados e ainda não pagos</h2>
        <p class="text-xs text-texto-suave">Todos os títulos com saldo em aberto, por ordem de vencimento.</p>
        <div v-if="somenteBaixados" class="mt-3 rounded-lg bg-destaque-claro p-3 text-sm">
          Os relatórios importados só trazem títulos pagos. Para esta lista funcionar, importe um relatório do FINA750 que inclua os títulos em aberto.
        </div>
        <div v-else class="mt-3 max-h-96 overflow-auto">
          <table class="tabela">
            <thead><tr><th>Vencimento</th><th>Fornecedor</th><th>Título</th><th>Comp.</th><th class="num">Valor</th><th>Situação</th></tr></thead>
            <tbody>
              <tr v-for="t in aPagar" :key="t.chave" class="cursor-pointer" @click="detalhe = { tipo: 'titulo', chave: t.chave }">
                <td class="tabular-nums font-semibold">{{ data(t.vencimentoReal) }}</td>
                <td>{{ nome(t) }}</td>
                <td class="tabular-nums">{{ t.numero }}</td>
                <td>{{ compCurta(t.competencia) }}</td>
                <td class="num">{{ moeda(t.saldo || t.valor) }}</td>
                <td><SituacaoSelo :situacao="situacaoTitulo(t)" /></td>
              </tr>
              <tr v-if="!aPagar.length"><td colspan="6" class="py-6 text-center text-texto-suave">Nenhum título a pagar.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="cartao p-5">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-bold">Últimos lançamentos</h2>
          <button class="botao" @click="irPara('pagamentos')">Ver todos</button>
        </div>
        <div class="mt-3 max-h-96 overflow-auto">
          <table class="tabela">
            <thead><tr><th>Lançado em</th><th>Fornecedor</th><th>Título</th><th class="num">Valor</th><th>Pago em</th></tr></thead>
            <tbody>
              <tr v-for="t in ultimosLancados" :key="t.chave" class="cursor-pointer" @click="detalhe = { tipo: 'titulo', chave: t.chave }">
                <td class="tabular-nums">{{ data(t.lancamento ?? t.emissao) }}</td>
                <td>{{ nome(t) }}</td>
                <td class="tabular-nums">{{ t.numero }}</td>
                <td class="num">{{ moeda(t.valor) }}</td>
                <td class="tabular-nums" :style="{ color: t.baixa ? 'var(--s-pago)' : 'var(--s-lancado)' }">{{ t.baixa ? data(t.baixa) : 'a pagar' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>
