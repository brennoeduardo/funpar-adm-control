<script setup lang="ts">
import { computed, ref } from 'vue'
import { dados, detalhe, filtros } from '../estado'
import { cnpj, contemTexto, data, moeda } from '../formato'

const mostrarInativos = ref(false)

const linhas = computed(() => {
  const d = dados.value!
  return d.fornecedores
    .filter((f) => mostrarInativos.value || f.ativo)
    .map((f) => {
      const titulos = d.titulos.filter((t) => t.fornecedor === f.codigo && (!f.loja || t.loja === f.loja))
      const pagos = titulos.filter((t) => t.baixa && t.saldo <= 0)
      return {
        f,
        lancados: titulos.length,
        aPagar: titulos.length - pagos.length,
        totalLancado: titulos.reduce((s, t) => s + t.valor, 0),
        totalPago: pagos.reduce((s, t) => s + t.valor, 0),
        ultimoLancamento: titulos.map((t) => t.lancamento ?? t.emissao).filter((b): b is string => !!b).sort().at(-1) ?? null,
        ultimoPagamento: pagos.map((t) => t.baixa).filter((b): b is string => !!b).sort().at(-1) ?? null,
      }
    })
    .filter((x) => contemTexto([x.f.nome, x.f.razaoSocial, x.f.codigo, x.f.cnpj, x.f.solicitante], filtros.busca))
    .sort((a, b) => a.f.nome.localeCompare(b.f.nome, 'pt-BR'))
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <span class="text-sm text-texto-suave">{{ linhas.length }} fornecedores</span>
      <label class="flex items-center gap-2 text-sm">
        <input v-model="mostrarInativos" type="checkbox" class="size-4 accent-marca-600" /> Mostrar inativos
      </label>
    </div>
    <div class="cartao overflow-auto" style="max-height: calc(100vh - 250px)">
      <table class="tabela">
        <thead>
          <tr>
            <th>Fornecedor</th><th>Código / loja</th><th>CNPJ/CPF</th><th>Pagamento</th><th>Solicitante</th>
            <th class="num">Títulos</th><th class="num">A pagar</th><th class="num">Lançado</th><th class="num">Pago</th>
            <th>Último lançamento</th><th>Último pagamento</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="x in linhas" :key="x.f.codigo + (x.f.loja ?? '')" class="cursor-pointer" :class="x.f.ativo ? '' : 'opacity-50'" @click="detalhe = { tipo: 'fornecedor', codigo: x.f.codigo }">
            <td>
              <div class="font-medium">{{ x.f.nome }}</div>
              <div class="text-xs text-texto-suave">{{ x.f.razaoSocial }}</div>
            </td>
            <td class="tabular-nums whitespace-nowrap">{{ x.f.codigo }} / {{ x.f.loja ?? 'qualquer' }}</td>
            <td class="tabular-nums whitespace-nowrap">{{ cnpj(x.f.cnpj) }}</td>
            <td>{{ x.f.formaPagamento ?? '—' }}</td>
            <td class="text-xs">{{ x.f.solicitante ?? '—' }}</td>
            <td class="num">{{ x.lancados || '—' }}</td>
            <td class="num" :style="x.aPagar ? 'color: var(--s-lancado); font-weight: 700' : ''">{{ x.aPagar || '—' }}</td>
            <td class="num">{{ x.totalLancado ? moeda(x.totalLancado) : '—' }}</td>
            <td class="num" style="color: var(--s-pago)">{{ x.totalPago ? moeda(x.totalPago) : '—' }}</td>
            <td class="tabular-nums">{{ data(x.ultimoLancamento) }}</td>
            <td class="tabular-nums">{{ data(x.ultimoPagamento) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
