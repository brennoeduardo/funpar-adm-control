<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { DESCRICAO_SITUACAO, montarMatriz, situacaoDosTitulos } from '@core/situacao'
import type { TituloVinculado } from '@core/tipos'
import { dados, detalhe, hoje, ofsParaSinalizar } from '../estado'
import { cnpj, compCurta, compLonga, data, dataHora, moeda } from '../formato'
import SituacaoSelo from './SituacaoSelo.vue'

const d = computed(() => dados.value!)
const fechar = () => (detalhe.value = null)
const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar()
onMounted(() => window.addEventListener('keydown', tecla))
onBeforeUnmount(() => window.removeEventListener('keydown', tecla))

const titulo = computed(() => {
  const x = detalhe.value
  return x?.tipo === 'titulo' ? d.value.titulos.find((t) => t.chave === x.chave) : undefined
})

const celula = computed(() => {
  const x = detalhe.value
  if (x?.tipo !== 'celula') return undefined
  const linha = montarMatriz(d.value, [x.competencia], hoje).find((l) => l.id === x.linhaId)
  return linha ? { linha, competencia: x.competencia, c: linha.celulas[x.competencia]! } : undefined
})

/** OFs abertas do fornecedor para a competência da célula, quando a nota ainda não foi lançada. */
const ofsCelula = computed(() => {
  const c = celula.value
  return c ? ofsParaSinalizar(c.linha.fornecedor.codigo, c.competencia, c.c.situacao) : []
})

const fornecedor = computed(() => {
  const x = detalhe.value
  if (x?.tipo === 'fornecedor') return d.value.fornecedores.find((f) => f.codigo === x.codigo)
  if (x?.tipo === 'celula') return celula.value?.linha.fornecedor
  if (titulo.value) return d.value.fornecedores.find((f) => f.codigo === titulo.value!.fornecedor)
  return undefined
})

const titulosDoFornecedor = computed(() =>
  fornecedor.value
    ? d.value.titulos
        .filter((t) => t.fornecedor === fornecedor.value!.codigo && (!fornecedor.value!.loja || t.loja === fornecedor.value!.loja))
        .sort((a, b) => (b.competencia ?? '').localeCompare(a.competencia ?? ''))
    : [],
)

/** Etapas do título: o que já aconteceu fica marcado. */
const etapas = computed(() => {
  const t = titulo.value
  if (!t) return []
  const pago = !!t.baixa && t.saldo <= 0
  return [
    { nome: 'Emitido', data: t.emissao, feito: !!t.emissao },
    { nome: 'Lançado', data: t.lancamento ?? t.emissao, feito: true },
    { nome: 'Liberado', data: t.liberacao, feito: !!t.liberacao },
    { nome: 'Vencimento', data: t.vencimentoReal, feito: pago || (t.vencimentoReal ?? '9999') <= hoje },
    { nome: 'Pago', data: t.baixa, feito: pago },
  ]
})

const copiado = ref(false)
async function copiar(texto: string, e: Event) {
  try {
    await navigator.clipboard.writeText(texto)
    copiado.value = true
    setTimeout(() => (copiado.value = false), 1500)
  } catch {
    // Sem permissão de área de transferência: seleciona o texto para Ctrl+C
    const input = (e.target as HTMLElement).parentElement?.querySelector('input')
    input?.select()
  }
}

const situacaoTitulo = (t: TituloVinculado) => situacaoDosTitulos([t], hoje)!
const abrirTitulo = (t: TituloVinculado) => (detalhe.value = { tipo: 'titulo', chave: t.chave })
</script>

<template>
  <div class="fixed inset-0 z-40 flex justify-end bg-marca-900/40" @click.self="fechar">
    <aside class="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl">
      <div class="flex items-start justify-between gap-4 border-b-4 border-destaque bg-marca-800 px-5 py-4 text-white">
        <div>
          <div class="rotulo text-destaque!">
            {{ titulo ? 'Título' : celula ? `Competência ${compLonga(celula.competencia)}` : 'Fornecedor' }}
          </div>
          <h2 class="text-lg font-bold leading-snug text-white!">
            <template v-if="titulo">{{ fornecedor?.nome ?? titulo.razaoSocial }} · {{ titulo.numero }}</template>
            <template v-else>{{ fornecedor?.nome }}</template>
          </h2>
        </div>
        <button class="botao-primario" @click="fechar">Fechar ✕</button>
      </div>

      <div class="flex-1 space-y-6 overflow-auto px-5 py-5 text-sm">
        <!-- Título -->
        <template v-if="titulo">
          <div class="flex flex-wrap items-center gap-2">
            <SituacaoSelo :situacao="situacaoTitulo(titulo)" />
            <span class="text-texto-suave">Competência {{ compCurta(titulo.competencia) }}</span>
          </div>

          <ol class="grid grid-cols-5 gap-1">
            <li v-for="(e, i) in etapas" :key="e.nome" class="relative text-center">
              <div v-if="i > 0" class="absolute top-3.5 right-1/2 left-[-50%] h-0.5" :class="e.feito ? 'bg-marca-600' : 'bg-slate-200'"></div>
              <div
                class="relative mx-auto flex size-7 items-center justify-center rounded-full border-2 text-xs font-bold"
                :class="e.feito ? (e.nome === 'Pago' ? 'border-[var(--s-pago)] bg-[var(--s-pago)] text-white' : 'border-marca-600 bg-marca-600 text-white') : 'border-slate-300 bg-white text-slate-300'"
              >{{ e.feito ? '✓' : i + 1 }}</div>
              <div class="mt-1 text-xs font-semibold">{{ e.nome }}</div>
              <div class="text-xs tabular-nums text-texto-suave">{{ data(e.data) }}</div>
            </li>
          </ol>

          <dl class="grid grid-cols-2 gap-x-6 gap-y-3">
            <div><dt class="rotulo">Fornecedor</dt><dd>{{ titulo.fornecedor }} / {{ titulo.loja }} · {{ cnpj(titulo.cnpj) }}</dd></div>
            <div><dt class="rotulo">Protocolo</dt><dd class="tabular-nums">{{ titulo.protocolo ?? '—' }}</dd></div>
            <div><dt class="rotulo">Prefixo / número / parcela / tipo</dt><dd class="tabular-nums">{{ titulo.prefixo || '—' }} / {{ titulo.numero }} / {{ titulo.parcela || '—' }} / {{ titulo.tipo }}</dd></div>
            <div><dt class="rotulo">Borderô</dt><dd>{{ titulo.bordero ?? '—' }}</dd></div>
            <div><dt class="rotulo">Valor</dt><dd class="text-base font-bold">{{ moeda(titulo.valor) }}</dd></div>
            <div><dt class="rotulo">Saldo a pagar</dt><dd class="text-base font-bold">{{ moeda(titulo.saldo) }}</dd></div>
            <div><dt class="rotulo">Natureza</dt><dd>{{ titulo.natureza ?? '—' }}</dd></div>
            <div><dt class="rotulo">Conta pagadora</dt><dd>{{ titulo.contaPag ?? '—' }}</dd></div>
            <div class="col-span-2">
              <dt class="rotulo">Retenções</dt>
              <dd class="tabular-nums">
                ISS {{ moeda(titulo.retencoes.iss) }} · IRRF {{ moeda(titulo.retencoes.irrf) }} · INSS {{ moeda(titulo.retencoes.inss) }} ·
                PIS {{ moeda(titulo.retencoes.pis) }} · COFINS {{ moeda(titulo.retencoes.cofins) }} · CSLL {{ moeda(titulo.retencoes.csll) }}
              </dd>
            </div>
            <div class="col-span-2"><dt class="rotulo">Histórico</dt><dd>{{ titulo.historico ?? '—' }}</dd></div>
            <div><dt class="rotulo">Usuário Protheus</dt><dd>{{ titulo.usuario ?? '—' }}</dd></div>
            <div><dt class="rotulo">Origem</dt><dd>{{ titulo.origem.arquivo }} · {{ dataHora(titulo.origem.geradoEm) }}</dd></div>
            <div v-if="titulo.observacaoAjuste" class="col-span-2"><dt class="rotulo">Observação (Ajustes)</dt><dd>{{ titulo.observacaoAjuste }}</dd></div>
          </dl>
          <div class="rounded-lg border border-slate-200 bg-fundo p-3">
            <div class="rotulo">Chave do título (para corrigir a competência na aba Ajustes do cadastros.xlsx)</div>
            <div class="mt-1 flex gap-2">
              <input :value="titulo.chave" readonly class="campo flex-1 font-mono text-xs" @focus="($event.target as HTMLInputElement).select()" />
              <button class="botao" @click="copiar(titulo.chave, $event)">{{ copiado ? 'Copiado ✓' : 'Copiar' }}</button>
            </div>
          </div>
        </template>

        <!-- Célula da visão mensal -->
        <template v-if="celula">
          <div class="flex flex-wrap items-center gap-2">
            <SituacaoSelo :situacao="celula.c.situacao" />
            <span class="text-texto-suave">{{ DESCRICAO_SITUACAO[celula.c.situacao] }}</span>
          </div>
          <div v-if="ofsCelula.length" class="rounded-lg border border-destaque bg-destaque-claro p-3">
            <div class="flex items-center gap-2 font-bold text-marca-700">
              <span class="rounded-full bg-destaque px-2 py-0.5 text-xs font-extrabold">OF</span>
              A nota ainda não foi lançada, mas já existe Ordem de Fornecimento aberta
            </div>
            <table class="mt-2 w-full text-xs">
              <thead><tr class="text-left text-texto-suave"><th class="py-1">OF</th><th class="py-1">Emissão</th><th class="py-1">Situação</th><th class="py-1">Item</th><th class="py-1 text-right">Valor</th></tr></thead>
              <tbody>
                <tr v-for="o in ofsCelula" :key="o.pedido" class="border-t border-destaque/50">
                  <td class="py-1 font-semibold tabular-nums">{{ o.pedido }}</td>
                  <td class="py-1 tabular-nums">{{ data(o.emissao) }}</td>
                  <td class="py-1">{{ o.status.charAt(0) + o.status.slice(1).toLowerCase() }}</td>
                  <td class="py-1">{{ o.descricao ?? '—' }}</td>
                  <td class="py-1 text-right tabular-nums">{{ moeda(o.valor) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3 class="mb-2 text-base font-bold">Títulos na competência</h3>
            <table class="tabela">
              <thead><tr><th>Título</th><th>Lançado em</th><th>Vencimento</th><th>Pago em</th><th class="num">Valor</th></tr></thead>
              <tbody>
                <tr v-for="t in celula.c.titulos" :key="t.chave" class="cursor-pointer" @click="abrirTitulo(t)">
                  <td class="tabular-nums">{{ t.numero }}</td>
                  <td>{{ data(t.lancamento ?? t.emissao) }}</td>
                  <td>{{ data(t.vencimentoReal) }}</td>
                  <td style="color: var(--s-pago)">{{ data(t.baixa) }}</td>
                  <td class="num">{{ moeda(t.valor) }}</td>
                </tr>
                <tr v-if="!celula.c.titulos.length"><td colspan="5" class="py-4 text-center text-texto-suave">Nenhum título nesta competência.</td></tr>
              </tbody>
            </table>
          </div>
        </template>

        <!-- Fornecedor -->
        <template v-if="fornecedor && !titulo">
          <div>
            <h3 class="mb-2 text-base font-bold">Fornecedor</h3>
            <dl class="grid grid-cols-2 gap-x-6 gap-y-3">
              <div class="col-span-2"><dt class="rotulo">Razão social</dt><dd>{{ fornecedor.razaoSocial }}</dd></div>
              <div><dt class="rotulo">Código / loja Protheus</dt><dd>{{ fornecedor.codigo }} / {{ fornecedor.loja ?? 'qualquer' }}</dd></div>
              <div><dt class="rotulo">CNPJ/CPF</dt><dd>{{ cnpj(fornecedor.cnpj) }}</dd></div>
              <div><dt class="rotulo">Solicitante</dt><dd>{{ fornecedor.solicitante ?? '—' }}</dd></div>
              <div><dt class="rotulo">Forma de pagamento</dt><dd>{{ fornecedor.formaPagamento ?? '—' }}</dd></div>
              <div><dt class="rotulo">Situação</dt><dd>{{ fornecedor.ativo ? 'Ativo' : 'Inativo' }}</dd></div>
              <div v-if="fornecedor.observacoes" class="col-span-2"><dt class="rotulo">Observações</dt><dd>{{ fornecedor.observacoes }}</dd></div>
            </dl>
          </div>
          <div v-if="!celula">
            <h3 class="mb-2 text-base font-bold">Títulos ({{ titulosDoFornecedor.length }})</h3>
            <table class="tabela">
              <thead><tr><th>Comp.</th><th>Título</th><th>Lançado em</th><th>Pago em</th><th class="num">Valor</th><th>Situação</th></tr></thead>
              <tbody>
                <tr v-for="t in titulosDoFornecedor" :key="t.chave" class="cursor-pointer" @click="abrirTitulo(t)">
                  <td>{{ compCurta(t.competencia) }}</td>
                  <td class="tabular-nums">{{ t.numero }}</td>
                  <td>{{ data(t.lancamento ?? t.emissao) }}</td>
                  <td style="color: var(--s-pago)">{{ data(t.baixa) }}</td>
                  <td class="num">{{ moeda(t.valor) }}</td>
                  <td><SituacaoSelo :situacao="situacaoTitulo(t)" /></td>
                </tr>
                <tr v-if="!titulosDoFornecedor.length"><td colspan="6" class="py-4 text-center text-texto-suave">Nenhum título nos relatórios importados.</td></tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </aside>
  </div>
</template>
