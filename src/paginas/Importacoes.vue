<script setup lang="ts">
import { computed, ref } from 'vue'
import { dados, importarManual, type ResumoImportacaoManual } from '../estado'
import { cnpj, data, dataHora, inteiro, moeda } from '../formato'

const d = computed(() => dados.value)
const processando = ref(false)
const resumo = ref<ResumoImportacaoManual | null>(null)
const erro = ref('')
const arrastando = ref(false)

async function processar(lista: FileList | null | undefined) {
  if (!lista?.length) return
  processando.value = true
  erro.value = ''
  resumo.value = null
  try {
    resumo.value = await importarManual([...lista])
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    processando.value = false
  }
}

const problemas = computed(() => [...(d.value?.problemas ?? [])].sort((a, b) => (a.gravidade === b.gravidade ? 0 : a.gravidade === 'erro' ? -1 : 1)))
</script>

<template>
  <div class="space-y-5">
    <div v-if="!d" class="cartao border-amber-300 bg-amber-50 p-5 text-amber-900">
      <h2 class="font-semibold">Nenhum dado carregado</h2>
      <p class="mt-1 text-sm">
        O arquivo <code>dados/gerado/dados.js</code> não foi encontrado ao lado deste HTML. Verifique se o gerador está rodando
        ou carregue os arquivos manualmente abaixo (o <code>cadastros.xlsx</code> e um ou mais relatórios do Protheus).
      </p>
    </div>

    <section class="cartao p-5">
      <h2 class="text-base font-semibold">Importação manual</h2>
      <p class="mt-1 text-sm text-texto-suave">
        Contingência para quando o gerador estiver parado ou para testar um relatório novo. O processamento acontece só neste navegador:
        os outros usuários não veem o resultado, e ele se perde ao recarregar a página.
      </p>
      <label
        class="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition"
        :class="arrastando ? 'border-marca-600 bg-marca-50' : 'border-slate-300 hover:border-marca-600'"
        @dragover.prevent="arrastando = true"
        @dragleave="arrastando = false"
        @drop.prevent="arrastando = false; processar($event.dataTransfer?.files)"
      >
        <span class="text-sm font-medium">{{ processando ? 'Processando…' : 'Arraste os arquivos aqui ou clique para escolher' }}</span>
        <span class="text-xs text-texto-suave">cadastros.xlsx (opcional se já houver dados) + relatórios FINA750 em .xlsx ou .csv</span>
        <input type="file" multiple accept=".xlsx,.xls,.xlsm,.csv" class="hidden" :disabled="processando" @change="processar(($event.target as HTMLInputElement).files)" />
      </label>
      <div v-if="erro" class="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">{{ erro }}</div>
      <div v-if="resumo" class="mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
        <div>Cadastros: {{ resumo.cadastros }}</div>
        <div v-for="p in resumo.processados" :key="p">✓ {{ p }}</div>
        <div v-for="f in resumo.falhas" :key="f" class="text-red-800">✗ {{ f }}</div>
      </div>
    </section>

    <template v-if="d">
      <section class="cartao p-5">
        <h2 class="text-base font-semibold">Relatórios importados</h2>
        <p class="mt-1 text-sm text-texto-suave">
          {{ inteiro(d.titulos.length) }} títulos de fornecedores cadastrados · {{ inteiro(d.ignorados) }} títulos de outros fornecedores ignorados.
          Títulos repetidos entre relatórios são unificados pela chave do Protheus (filial, prefixo, número, parcela, tipo, fornecedor e loja).
        </p>
        <div class="mt-3 overflow-auto">
          <table class="tabela">
            <thead>
              <tr><th>Arquivo</th><th>Layout</th><th>Conteúdo</th><th>Emissões</th><th>Pagamentos (baixas)</th><th class="num">Linhas</th><th>Gerado em</th><th>Importado em</th><th>Erros</th></tr>
            </thead>
            <tbody>
              <tr v-for="c in d.coberturas" :key="c.hash">
                <td class="font-medium">{{ c.arquivo }}</td>
                <td>{{ c.layout }}</td>
                <td>
                  <span class="rounded-full border px-2 py-0.5 text-xs" :class="c.tipo === 'baixados' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'">
                    {{ c.tipo === 'baixados' ? 'Só pagos' : c.tipo === 'abertos' ? 'Só em aberto' : 'Pagos e em aberto' }}
                  </span>
                </td>
                <td class="tabular-nums whitespace-nowrap">{{ data(c.emissaoIni) }} a {{ data(c.emissaoFim) }}</td>
                <td class="tabular-nums whitespace-nowrap">{{ c.baixaIni ? `${data(c.baixaIni)} a ${data(c.baixaFim)}` : '—' }}</td>
                <td class="num">{{ inteiro(c.linhas) }}</td>
                <td class="tabular-nums whitespace-nowrap">{{ dataHora(c.geradoEm) }}</td>
                <td class="tabular-nums whitespace-nowrap">{{ dataHora(c.importadoEm) }}</td>
                <td class="text-xs text-red-700">
                  <details v-if="c.erros.length"><summary>{{ c.erros.length }}</summary><div v-for="e in c.erros" :key="e">{{ e }}</div></details>
                  <span v-else class="text-slate-400">—</span>
                </td>
              </tr>
              <tr v-for="f in d.falhas" :key="f.arquivo" class="bg-red-50/50">
                <td class="font-medium">{{ f.arquivo }}</td>
                <td colspan="8" class="text-sm text-red-800">Não importado: {{ f.erro }} (será tentado de novo na próxima execução)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="grid gap-5 xl:grid-cols-2">
        <div class="cartao p-5">
          <h2 class="text-base font-semibold">Problemas no cadastros.xlsx</h2>
          <p class="mt-1 text-sm text-texto-suave">Linhas com erro não entram no painel. Corrija no arquivo; o gerador relê na próxima execução.</p>
          <div class="mt-3 max-h-[28rem] overflow-auto">
            <table class="tabela">
              <thead><tr><th></th><th>Aba</th><th>Linha</th><th>Problema</th></tr></thead>
              <tbody>
                <tr v-for="(p, i) in problemas" :key="i">
                  <td><span class="rounded px-1.5 py-0.5 text-xs font-semibold" :class="p.gravidade === 'erro' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'">{{ p.gravidade }}</span></td>
                  <td class="whitespace-nowrap">{{ p.origem }}</td>
                  <td class="tabular-nums">{{ p.linha ?? '' }}</td>
                  <td>{{ p.mensagem }}</td>
                </tr>
                <tr v-if="!problemas.length"><td colspan="4" class="py-6 text-center text-emerald-700">Nenhum problema encontrado.</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="cartao p-5">
          <h2 class="text-base font-semibold">Possíveis fornecedores ADM fora do cadastro</h2>
          <p class="mt-1 text-sm text-texto-suave">
            Fornecedores que aparecem nos relatórios com a mesma conta pagadora e natureza dos contratos cadastrados. Se fizerem parte do controle ADM, inclua-os no cadastros.xlsx.
          </p>
          <div class="mt-3 max-h-[28rem] overflow-auto">
            <table class="tabela">
              <thead><tr><th>Fornecedor</th><th>Código / loja</th><th>CNPJ/CPF</th><th class="num">Títulos</th><th class="num">Total</th></tr></thead>
              <tbody>
                <tr v-for="c in d.candidatos" :key="c.codigo + c.loja">
                  <td>{{ c.nome }}</td>
                  <td class="tabular-nums whitespace-nowrap">{{ c.codigo }} / {{ c.loja }}</td>
                  <td class="tabular-nums whitespace-nowrap">{{ cnpj(c.cnpj) }}</td>
                  <td class="num">{{ c.quantidade }}</td>
                  <td class="num">{{ moeda(c.total) }}</td>
                </tr>
                <tr v-if="!d.candidatos.length"><td colspan="5" class="py-6 text-center text-texto-suave">Nenhum candidato.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
