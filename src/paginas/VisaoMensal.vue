<script setup lang="ts">
import { computed, ref } from 'vue'
import { DESCRICAO_SITUACAO, ROTULO_SITUACAO } from '@core/situacao'
import { competenciaDe } from '@core/util'
import { anosDisponiveis, detalhe, filtrarLinhas, filtros, hoje, matrizAno } from '../estado'
import { mesCurto, moeda } from '../formato'
import { ESTILO_SITUACAO, ORDEM_SITUACAO } from '../componentes/estilos'

const ocultarSemPrevisao = ref(true)
const competencias = computed(() => Array.from({ length: 12 }, (_, i) => `${filtros.ano}-${String(i + 1).padStart(2, '0')}`))
const mesAtual = competenciaDe(hoje)

const linhas = computed(() =>
  filtrarLinhas(matrizAno.value).filter(
    (l) => !ocultarSemPrevisao.value || l.previsto || Object.values(l.celulas).some((c) => c.titulos.length),
  ),
)

const totais = computed(() =>
  competencias.value.map((c) => ({
    lancado: linhas.value.reduce((s, l) => s + (l.celulas[c]?.valor ?? 0), 0),
    pago: linhas.value.reduce((s, l) => s + (l.celulas[c]?.valorPago ?? 0), 0),
  })),
)
const mil = (v: number) => (v ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—')
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div class="flex flex-wrap items-end gap-3">
        <label class="flex flex-col gap-1">
          <span class="rotulo">Ano</span>
          <select v-model.number="filtros.ano" class="campo">
            <option v-for="a in anosDisponiveis" :key="a" :value="a">{{ a }}</option>
          </select>
        </label>
        <label class="flex items-center gap-2 pb-1.5 text-sm">
          <input v-model="ocultarSemPrevisao" type="checkbox" class="size-4 accent-marca-600" />
          Ocultar fornecedores inativos ou sem pagamento mensal
        </label>
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-texto-suave">
        <span v-for="s in ORDEM_SITUACAO.filter((x) => x !== 'futuro' && x !== 'nao_previsto')" :key="s" class="flex items-center gap-1.5" :title="DESCRICAO_SITUACAO[s]">
          <span
            class="inline-flex size-5 items-center justify-center rounded text-[11px] font-bold"
            :style="{ background: ESTILO_SITUACAO[s].fundo, color: ESTILO_SITUACAO[s].cor, border: `1px solid ${ESTILO_SITUACAO[s].cor}40` }"
          >{{ ESTILO_SITUACAO[s].simbolo }}</span>
          {{ ROTULO_SITUACAO[s] }}
        </span>
      </div>
    </div>

    <div class="cartao overflow-auto" style="max-height: calc(100vh - 260px)">
      <table class="tabela">
        <thead>
          <tr>
            <th class="sticky left-0 z-20 min-w-72">Fornecedor</th>
            <th>Pagamento</th>
            <th v-for="c in competencias" :key="c" class="text-center" :class="c === mesAtual ? 'bg-destaque! text-marca-700!' : ''">{{ mesCurto(c) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in linhas" :key="l.id">
            <td class="sticky left-0 z-10 bg-white">
              <button class="text-left font-medium hover:text-marca-600 hover:underline" @click="detalhe = { tipo: 'fornecedor', codigo: l.fornecedor.codigo }">
                {{ l.fornecedor.nome }}
              </button>
              <div class="text-xs text-texto-suave">{{ l.fornecedor.codigo }}{{ l.fornecedor.loja ? ' / ' + l.fornecedor.loja : '' }}</div>
            </td>
            <td class="text-xs whitespace-nowrap">{{ l.fornecedor.formaPagamento ?? '—' }}</td>
            <td v-for="c in competencias" :key="c" class="p-1 text-center" :class="c === mesAtual ? 'bg-destaque-claro' : ''">
              <button
                v-if="l.celulas[c]!.situacao !== 'nao_previsto' && l.celulas[c]!.situacao !== 'futuro'"
                class="inline-flex size-8 items-center justify-center rounded-md text-sm font-bold transition hover:scale-110 hover:shadow"
                :style="{ background: ESTILO_SITUACAO[l.celulas[c]!.situacao].fundo, color: ESTILO_SITUACAO[l.celulas[c]!.situacao].cor, border: `1px solid ${ESTILO_SITUACAO[l.celulas[c]!.situacao].cor}40` }"
                :title="`${ROTULO_SITUACAO[l.celulas[c]!.situacao]}${l.celulas[c]!.valor ? ' · ' + moeda(l.celulas[c]!.valor) : ''}`"
                @click="detalhe = { tipo: 'celula', linhaId: l.id, competencia: c }"
              >
                {{ ESTILO_SITUACAO[l.celulas[c]!.situacao].simbolo }}<sub v-if="l.celulas[c]!.titulos.length > 1" class="text-[9px]">{{ l.celulas[c]!.titulos.length }}</sub>
              </button>
              <span v-else class="text-slate-300">·</span>
            </td>
          </tr>
          <tr v-if="!linhas.length"><td :colspan="14" class="py-10 text-center text-texto-suave">Nenhum fornecedor com os filtros atuais.</td></tr>
        </tbody>
        <tfoot class="text-xs">
          <tr class="bg-marca-50 font-semibold">
            <td class="sticky left-0 bg-marca-50 px-3 py-1.5" colspan="2">Lançado no mês (R$ mil)</td>
            <td v-for="(t, i) in totais" :key="i" class="px-1 py-1.5 text-center tabular-nums">{{ mil(t.lancado) }}</td>
          </tr>
          <tr class="bg-marca-50 font-semibold" style="color: var(--s-pago)">
            <td class="sticky left-0 bg-marca-50 px-3 py-1.5" colspan="2">Pago (R$ mil)</td>
            <td v-for="(t, i) in totais" :key="i" class="px-1 py-1.5 text-center tabular-nums">{{ mil(t.pago) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p class="text-xs text-texto-suave">
      Cada célula mostra se o fornecedor teve título lançado na competência e se foi pago. A competência é o mês da emissão do título.
      O número pequeno indica mais de um título no mês.
    </p>
  </div>
</template>
