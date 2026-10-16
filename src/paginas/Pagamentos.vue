<script setup lang="ts">
import { computed, ref } from 'vue'
import * as XLSX from 'xlsx'
import { ROTULO_SITUACAO, situacaoDosTitulos } from '@core/situacao'
import type { TituloVinculado } from '@core/tipos'
import { dados, detalhe, fornecedorPorCodigo, hoje, passaFiltroTitulo } from '../estado'
import { compCurta, data, moeda } from '../formato'
import SituacaoSelo from '../componentes/SituacaoSelo.vue'

const competencia = ref('')
const situacao = ref('')
type Coluna = 'fornecedor' | 'numero' | 'competencia' | 'lancamento' | 'liberacao' | 'vencimentoReal' | 'baixa' | 'valor'
const ordem = ref<{ col: Coluna; desc: boolean }>({ col: 'lancamento', desc: true })

const situacaoDe = (t: TituloVinculado) => situacaoDosTitulos([t], hoje)!
const nomeDe = (t: TituloVinculado) => fornecedorPorCodigo.value.get(t.fornecedor)?.nome ?? t.razaoSocial
const lancadoEm = (t: TituloVinculado) => t.lancamento ?? t.emissao

const competencias = computed(() => [...new Set((dados.value?.titulos ?? []).map((t) => t.competencia).filter((c): c is string => !!c))].sort().reverse())

const linhas = computed(() => {
  const r = (dados.value?.titulos ?? []).filter((t) => {
    if (!passaFiltroTitulo(t)) return false
    if (competencia.value && t.competencia !== competencia.value) return false
    if (situacao.value && situacaoDe(t) !== situacao.value) return false
    return true
  })
  const { col, desc } = ordem.value
  const valor = (t: TituloVinculado): string | number =>
    col === 'fornecedor' ? nomeDe(t) : col === 'valor' ? t.valor : col === 'lancamento' ? (lancadoEm(t) ?? '') : (t[col] ?? '')
  return r.sort((a, b) => {
    const va = valor(a)
    const vb = valor(b)
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')
    return desc ? -c : c
  })
})
const total = computed(() => linhas.value.reduce((s, t) => s + t.valor, 0))
const totalPago = computed(() => linhas.value.filter((t) => situacaoDe(t) === 'pago').reduce((s, t) => s + t.valor, 0))

function ordenar(col: Coluna) {
  ordem.value = ordem.value.col === col ? { col, desc: !ordem.value.desc } : { col, desc: ['valor', 'lancamento', 'liberacao', 'vencimentoReal', 'baixa'].includes(col) }
}
const seta = (col: Coluna) => (ordem.value.col === col ? (ordem.value.desc ? ' ▼' : ' ▲') : '')

function exportar() {
  const ws = XLSX.utils.json_to_sheet(
    linhas.value.map((t) => ({
      Fornecedor: nomeDe(t),
      'Código': t.fornecedor,
      Loja: t.loja,
      'Nº Título': t.numero,
      Prefixo: t.prefixo,
      Parcela: t.parcela,
      Tipo: t.tipo,
      Protocolo: t.protocolo,
      'Competência': t.competencia,
      'Emissão': data(t.emissao),
      'Lançado em': data(lancadoEm(t)),
      'Liberado em': data(t.liberacao),
      Vencimento: data(t.vencimentoReal),
      'Pago em': data(t.baixa),
      Valor: t.valor,
      Saldo: t.saldo,
      'Situação': ROTULO_SITUACAO[situacaoDe(t)],
      Natureza: t.natureza,
      'Conta Pag.': t.contaPag,
      'Chave Título': t.chave,
    })),
  )
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Lançamentos')
  XLSX.writeFile(wb, `lancamentos-adm-${hoje}.xlsx`)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end gap-3">
      <label class="flex flex-col gap-1">
        <span class="rotulo">Competência</span>
        <select v-model="competencia" class="campo">
          <option value="">Todas</option>
          <option v-for="c in competencias" :key="c" :value="c">{{ compCurta(c) }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="rotulo">Situação</span>
        <select v-model="situacao" class="campo">
          <option value="">Todas</option>
          <option value="pago">{{ ROTULO_SITUACAO.pago }}</option>
          <option value="lancado">{{ ROTULO_SITUACAO.lancado }}</option>
          <option value="vencido">{{ ROTULO_SITUACAO.vencido }}</option>
        </select>
      </label>
      <div class="ml-auto flex items-center gap-4">
        <span class="text-sm text-texto-suave">
          {{ linhas.length }} títulos · lançado <strong class="text-marca-700">{{ moeda(total) }}</strong> · pago
          <strong style="color: var(--s-pago)">{{ moeda(totalPago) }}</strong>
        </span>
        <button class="botao-primario" @click="exportar">Exportar para Excel</button>
      </div>
    </div>

    <div class="cartao overflow-auto" style="max-height: calc(100vh - 270px)">
      <table class="tabela">
        <thead>
          <tr>
            <th class="cursor-pointer" @click="ordenar('fornecedor')">Fornecedor{{ seta('fornecedor') }}</th>
            <th class="cursor-pointer" @click="ordenar('numero')">Título{{ seta('numero') }}</th>
            <th>Protocolo</th>
            <th class="cursor-pointer" @click="ordenar('competencia')">Comp.{{ seta('competencia') }}</th>
            <th class="cursor-pointer" @click="ordenar('lancamento')">Lançado em{{ seta('lancamento') }}</th>
            <th class="cursor-pointer" @click="ordenar('liberacao')">Liberado em{{ seta('liberacao') }}</th>
            <th class="cursor-pointer" @click="ordenar('vencimentoReal')">Vencimento{{ seta('vencimentoReal') }}</th>
            <th class="cursor-pointer" @click="ordenar('baixa')">Pago em{{ seta('baixa') }}</th>
            <th class="num cursor-pointer" @click="ordenar('valor')">Valor{{ seta('valor') }}</th>
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in linhas" :key="t.chave" class="cursor-pointer" @click="detalhe = { tipo: 'titulo', chave: t.chave }">
            <td class="font-medium">{{ nomeDe(t) }}</td>
            <td class="tabular-nums whitespace-nowrap">{{ t.numero }}{{ t.parcela ? '/' + t.parcela : '' }} <span class="text-xs text-texto-suave">{{ t.tipo }}</span></td>
            <td class="tabular-nums">{{ t.protocolo ?? '—' }}</td>
            <td class="whitespace-nowrap">{{ compCurta(t.competencia) }}</td>
            <td class="tabular-nums">{{ data(lancadoEm(t)) }}</td>
            <td class="tabular-nums">{{ data(t.liberacao) }}</td>
            <td class="tabular-nums">{{ data(t.vencimentoReal) }}</td>
            <td class="tabular-nums font-medium" style="color: var(--s-pago)">{{ data(t.baixa) }}</td>
            <td class="num">{{ moeda(t.valor) }}</td>
            <td><SituacaoSelo :situacao="situacaoDe(t)" /></td>
          </tr>
          <tr v-if="!linhas.length"><td colspan="10" class="py-10 text-center text-texto-suave">Nenhum título com os filtros atuais.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
