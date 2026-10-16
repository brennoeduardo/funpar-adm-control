<script setup lang="ts">
import { computed, ref } from 'vue'
import * as XLSX from 'xlsx'
import { numeroCurto } from '@core/situacao'
import type { ContratoProtheus } from '@core/tipos'
import { diasEntre } from '@core/util'
import { dados, detalhe, filtros, fornecedorPorCodigo, hoje } from '../estado'
import { cnpj, contemTexto, data, dataHora, moeda } from '../formato'

type Faixa = '' | '30' | '60' | '90' | 'semvalor'
const faixa = ref<Faixa>('')
const tipo = ref('')
const tipoVenc = ref('')
const soAdm = ref(false)
const aberto = ref<Set<string>>(new Set())
/** Por fornecedor (padrão): os pagamentos só se ligam ao fornecedor, e alguns têm dezenas de contratos (ex.: telefonia, um por linha). */
const agrupar = ref(true)

const contratos = computed(() => dados.value?.contratosProtheus ?? [])
const dias = (c: ContratoProtheus) => (c.fim ? diasEntre(hoje, c.fim) : null)
const chave = (c: ContratoProtheus) => `${c.contrato}|${c.codFornecedor}`

const tipos = computed(() => [...new Set(contratos.value.map((c) => c.tipo).filter((t): t is string => !!t))].sort())
const tiposVenc = computed(() => [...new Set(contratos.value.map((c) => c.tipoVencimento ?? '(não informado)'))].sort())

const kpi = computed(() => {
  const cs = contratos.value
  const ate = (n: number) => cs.filter((c) => (dias(c) ?? 9999) <= n).length
  return {
    total: cs.length,
    fornecedores: new Set(cs.map((c) => c.codFornecedor)).size,
    d30: ate(30),
    d60: ate(60),
    d90: ate(90),
    semValor: cs.filter((c) => !c.valorMedio).length,
    mensal: cs.filter((c) => c.tipoVencimento === 'MENSAL').reduce((s, c) => s + (c.valorMedio ?? 0), 0),
  }
})

const linhas = computed(() =>
  contratos.value
    .filter((c) => {
      const d = dias(c) ?? 9999
      if (faixa.value === '30' && d > 30) return false
      if (faixa.value === '60' && d > 60) return false
      if (faixa.value === '90' && d > 90) return false
      if (faixa.value === 'semvalor' && c.valorMedio) return false
      if (tipo.value && c.tipo !== tipo.value) return false
      if (tipoVenc.value && (c.tipoVencimento ?? '(não informado)') !== tipoVenc.value) return false
      if (soAdm.value && !fornecedorPorCodigo.value.has(c.codFornecedor)) return false
      return contemTexto(
        [c.contrato, numeroCurto(c.contrato), c.fornecedor, c.codFornecedor, c.cnpj, c.objeto, c.processo, c.descNatureza, ...c.produtos.map((p) => p.descricao), ...c.centrosCusto.map((x) => x.descricao)],
        filtros.busca,
      )
    })
    .sort((a, b) => (a.fim ?? '9999').localeCompare(b.fim ?? '9999')),
)

interface GrupoFornecedor {
  cod: string
  nome: string
  contratos: ContratoProtheus[]
  valorMedio: number
  proximoFim: ContratoProtheus
  pagamentos: ContratoProtheus['pagamentos']
}
const porFornecedor = computed<GrupoFornecedor[]>(() => {
  const m = new Map<string, ContratoProtheus[]>()
  for (const c of linhas.value) m.set(c.codFornecedor, [...(m.get(c.codFornecedor) ?? []), c])
  return [...m.entries()]
    .map(([cod, cs]) => ({
      cod,
      nome: fornecedorPorCodigo.value.get(cod)?.nome ?? cs[0]!.fornecedor,
      contratos: cs,
      valorMedio: cs.reduce((s, c) => s + (c.valorMedio ?? 0), 0),
      proximoFim: cs[0]!, // linhas já vêm ordenadas pelo fim da vigência
      pagamentos: cs[0]!.pagamentos,
    }))
    .sort((a, b) => (a.proximoFim.fim ?? '9999').localeCompare(b.proximoFim.fim ?? '9999'))
})

/** A média recente paga foge mais de 10% da soma dos valores médios do fornecedor? */
function divergenteGrupo(g: GrupoFornecedor): boolean {
  const m = g.pagamentos?.mediaRecente
  return !!(g.valorMedio && m && Math.abs(m - g.valorMedio) / g.valorMedio > 0.1)
}

function vigencia(c: ContratoProtheus): { rotulo: string; classe: string } {
  const d = dias(c)
  if (d === null) return { rotulo: 'Sem data fim', classe: 'bg-slate-50 text-slate-600 border-slate-200' }
  if (d < 0) return { rotulo: `Vencido há ${-d} d`, classe: 'bg-[var(--s-vencido-bg)] text-[var(--s-vencido)] border-[var(--s-vencido)]/30' }
  if (d <= 30) return { rotulo: d === 0 ? 'Vence hoje' : `Vence em ${d} d`, classe: 'bg-[var(--s-vencido-bg)] text-[var(--s-vencido)] border-[var(--s-vencido)]/30' }
  if (d <= 90) return { rotulo: `Vence em ${d} d`, classe: 'bg-[var(--s-naolancado-bg)] text-[var(--s-naolancado)] border-[var(--s-naolancado)]/30' }
  return { rotulo: d > 365 ? `${Math.floor(d / 365)} ano(s)+` : `${d} d`, classe: 'bg-[var(--s-pago-bg)] text-[var(--s-pago)] border-[var(--s-pago)]/30' }
}

/** A média recente paga foge mais de 10% do valor médio do contrato? */
function divergente(c: ContratoProtheus): boolean {
  const m = c.pagamentos?.mediaRecente
  return !!(c.valorMedio && m && Math.abs(m - c.valorMedio) / c.valorMedio > 0.1)
}

function alternar(id: string) {
  const n = new Set(aberto.value)
  if (n.has(id)) n.delete(id)
  else n.add(id)
  aberto.value = n
}

function exportar() {
  const ws = XLSX.utils.json_to_sheet(
    linhas.value.map((c) => ({
      Contrato: c.contrato,
      'Cód. fornecedor': c.codFornecedor,
      Fornecedor: c.fornecedor,
      'CPF/CNPJ': c.cnpj,
      'Processo interno': c.processo,
      'Início': data(c.inicio),
      Fim: data(c.fim),
      'Dias para o fim': dias(c),
      Tipo: c.tipo,
      'Tipo vencimento': c.tipoVencimento,
      'Valor médio': c.valorMedio,
      Natureza: [c.natureza, c.descNatureza].filter(Boolean).join(' - '),
      Produtos: c.produtos.map((p) => p.descricao ?? p.codigo).join('; '),
      'Centros de custo': c.centrosCusto.map((x) => [x.codigo, x.descricao].filter(Boolean).join(' ')).join('; '),
      'Centro de negócio': c.centroNegocio,
      Objeto: c.objeto,
      'Pago no ano (fornecedor)': c.pagamentos?.pagoNoAno ?? 0,
      'Média recente paga (fornecedor)': c.pagamentos?.mediaRecente ?? null,
      'Último pagamento': data(c.pagamentos?.ultimoPagamento),
      'A pagar (fornecedor)': c.pagamentos?.valorAPagar ?? 0,
    })),
  )
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Contratos')
  XLSX.writeFile(wb, `contratos-adm-${hoje}.xlsx`)
}

function abrirFornecedor(c: ContratoProtheus, e: Event) {
  if (!fornecedorPorCodigo.value.has(c.codFornecedor)) return
  e.stopPropagation()
  detalhe.value = { tipo: 'fornecedor', codigo: c.codFornecedor }
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="!dados?.contratosProtheus" class="cartao border-destaque bg-destaque-claro p-5">
      <h2 class="text-base font-bold">Contratos ainda não carregados</h2>
      <p class="mt-1 text-sm">
        Esta aba é alimentada pela view de contratos do Protheus, extraída pela rotina automática a cada 30 minutos.
        Os dados aparecem após a próxima execução (ou rode <code>gerador\atualizar-auto.cmd</code>).
      </p>
    </div>

    <template v-else>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <p class="text-sm text-texto-suave">Contratos vigentes do Protheus · extraídos em {{ dataHora(dados.contratosGeradoEm) }}</p>
        <button class="botao-primario" @click="exportar">Exportar para Excel</button>
      </div>

      <!-- Indicadores (clique para filtrar) -->
      <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <button class="cartao p-4 text-left transition" :class="faixa === '' ? 'ring-2 ring-marca-600' : 'hover:border-marca-600'" @click="faixa = ''">
          <div class="rotulo">Contratos vigentes</div>
          <div class="mt-1 text-3xl font-extrabold">{{ kpi.total }}</div>
          <div class="text-xs text-texto-suave">{{ kpi.fornecedores }} fornecedores</div>
        </button>
        <button class="cartao p-4 text-left transition" :class="faixa === '30' ? 'ring-2 ring-[var(--s-vencido)]' : 'hover:border-[var(--s-vencido)]'" @click="faixa = faixa === '30' ? '' : '30'">
          <div class="rotulo">Vencem em 30 dias</div>
          <div class="mt-1 text-3xl font-extrabold" style="color: var(--s-vencido)">{{ kpi.d30 }}</div>
        </button>
        <button class="cartao p-4 text-left transition" :class="faixa === '60' ? 'ring-2 ring-[var(--s-naolancado)]' : 'hover:border-[var(--s-naolancado)]'" @click="faixa = faixa === '60' ? '' : '60'">
          <div class="rotulo">Vencem em 60 dias</div>
          <div class="mt-1 text-3xl font-extrabold" style="color: var(--s-naolancado)">{{ kpi.d60 }}</div>
        </button>
        <button class="cartao p-4 text-left transition" :class="faixa === '90' ? 'ring-2 ring-[var(--s-naolancado)]' : 'hover:border-[var(--s-naolancado)]'" @click="faixa = faixa === '90' ? '' : '90'">
          <div class="rotulo">Vencem em 90 dias</div>
          <div class="mt-1 text-3xl font-extrabold" style="color: var(--s-naolancado)">{{ kpi.d90 }}</div>
        </button>
        <div class="cartao p-4">
          <div class="rotulo">Valor médio mensal</div>
          <div class="mt-1 text-xl font-extrabold">{{ moeda(kpi.mensal) }}</div>
          <div class="text-xs text-texto-suave">contratos com vencimento mensal</div>
        </div>
        <button class="cartao p-4 text-left transition" :class="faixa === 'semvalor' ? 'ring-2 ring-marca-600' : 'hover:border-marca-600'" @click="faixa = faixa === 'semvalor' ? '' : 'semvalor'">
          <div class="rotulo">Sem valor médio</div>
          <div class="mt-1 text-3xl font-extrabold text-texto-suave">{{ kpi.semValor }}</div>
          <div class="text-xs text-texto-suave">cadastrar no Protheus</div>
        </button>
      </div>

      <div class="flex flex-wrap items-end gap-3">
        <label class="flex flex-col gap-1">
          <span class="rotulo">Tipo de contrato</span>
          <select v-model="tipo" class="campo">
            <option value="">Todos</option>
            <option v-for="t in tipos" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="rotulo">Vencimento</span>
          <select v-model="tipoVenc" class="campo">
            <option value="">Todos</option>
            <option v-for="t in tiposVenc" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <label class="flex items-center gap-2 pb-1.5 text-sm">
          <input v-model="soAdm" type="checkbox" class="size-4 accent-marca-600" /> Só fornecedores do cadastro ADM
        </label>
        <div class="flex overflow-hidden rounded-full border border-marca-600 text-sm font-semibold">
          <button class="px-3 py-1.5" :class="agrupar ? 'bg-marca-600 text-white' : 'bg-white text-marca-600'" @click="agrupar = true; aberto = new Set()">Por fornecedor</button>
          <button class="px-3 py-1.5" :class="!agrupar ? 'bg-marca-600 text-white' : 'bg-white text-marca-600'" @click="agrupar = false; aberto = new Set()">Por contrato</button>
        </div>
        <span class="ml-auto pb-1.5 text-sm text-texto-suave">
          {{ agrupar ? `${porFornecedor.length} fornecedores · ` : '' }}{{ linhas.length }} contratos · ordenados pelo fim da vigência
        </span>
      </div>

      <!-- Visão por fornecedor -->
      <div v-if="agrupar" class="cartao overflow-auto" style="max-height: calc(100vh - 380px)">
        <table class="tabela">
          <thead>
            <tr>
              <th class="w-6"></th>
              <th>Fornecedor</th><th class="num">Contratos</th><th>Próximo fim</th><th>Vigência</th>
              <th class="num">Valor médio*</th><th class="num">Média paga</th><th class="num">Pago no ano</th><th>Último pagto.</th><th class="num">A pagar</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="g in porFornecedor" :key="g.cod">
              <tr class="cursor-pointer" @click="alternar(g.cod)">
                <td class="text-texto-suave">{{ aberto.has(g.cod) ? '▾' : '▸' }}</td>
                <td>
                  <button class="text-left font-medium" :class="fornecedorPorCodigo.has(g.cod) ? 'hover:text-marca-600 hover:underline' : 'cursor-default'" @click="abrirFornecedor(g.proximoFim, $event)">{{ g.nome }}</button>
                  <div class="text-xs text-texto-suave">
                    {{ g.cod }}
                    <span v-if="fornecedorPorCodigo.has(g.cod)" class="ml-1 rounded-full bg-marca-100 px-1.5 py-0.5 text-[10px] font-bold text-marca-700">ADM</span>
                  </div>
                </td>
                <td class="num">{{ g.contratos.length }}</td>
                <td class="tabular-nums">{{ data(g.proximoFim.fim) }} <span class="text-xs text-texto-suave">({{ numeroCurto(g.proximoFim.contrato) }})</span></td>
                <td><span class="rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap" :class="vigencia(g.proximoFim).classe">{{ vigencia(g.proximoFim).rotulo }}</span></td>
                <td class="num">{{ g.valorMedio ? moeda(g.valorMedio) : '—' }}</td>
                <td class="num" :class="divergenteGrupo(g) ? 'font-semibold text-[var(--s-naolancado)]' : ''" :title="divergenteGrupo(g) ? 'Média paga difere mais de 10% da soma dos valores médios' : ''">
                  {{ g.pagamentos?.mediaRecente ? moeda(g.pagamentos.mediaRecente) : '—' }}
                </td>
                <td class="num">{{ g.pagamentos?.pagoNoAno ? moeda(g.pagamentos.pagoNoAno) : '—' }}</td>
                <td class="tabular-nums">{{ data(g.pagamentos?.ultimoPagamento) }}</td>
                <td class="num" :style="g.pagamentos?.aPagar ? 'color: var(--s-lancado); font-weight: 600' : ''">{{ g.pagamentos?.aPagar ? moeda(g.pagamentos.valorAPagar) : '—' }}</td>
              </tr>
              <tr v-if="aberto.has(g.cod)" class="bg-fundo">
                <td></td>
                <td colspan="9" class="p-0">
                  <table class="w-full text-xs">
                    <thead>
                      <tr class="text-left text-texto-suave">
                        <th class="px-3 py-1.5">Contrato</th><th class="px-3 py-1.5">Objeto</th><th class="px-3 py-1.5">Tipo · venc.</th><th class="px-3 py-1.5">Vigência</th><th class="px-3 py-1.5">Fim</th><th class="px-3 py-1.5 text-right">Valor médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="c in g.contratos" :key="c.contrato" class="border-t border-slate-200 align-top">
                        <td class="px-3 py-1.5 font-semibold tabular-nums whitespace-nowrap">{{ numeroCurto(c.contrato) }}<div v-if="c.processo" class="font-normal text-texto-suave">proc. {{ c.processo }}</div></td>
                        <td class="px-3 py-1.5"><div class="line-clamp-3" :title="c.objeto ?? ''">{{ c.objeto ?? '—' }}</div><div class="text-texto-suave">{{ c.produtos.map((p) => p.descricao).filter(Boolean).join('; ') }}</div></td>
                        <td class="px-3 py-1.5 whitespace-nowrap">{{ c.tipo ?? '—' }}<div class="text-texto-suave">{{ c.tipoVencimento ?? 'não informado' }}</div></td>
                        <td class="px-3 py-1.5"><span class="rounded-full border px-2 py-0.5 font-semibold whitespace-nowrap" :class="vigencia(c).classe">{{ vigencia(c).rotulo }}</span></td>
                        <td class="px-3 py-1.5 tabular-nums whitespace-nowrap">{{ data(c.inicio) }} a {{ data(c.fim) }}</td>
                        <td class="px-3 py-1.5 text-right tabular-nums">{{ c.valorMedio ? moeda(c.valorMedio) : '—' }}</td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </template>
            <tr v-if="!porFornecedor.length"><td colspan="10" class="py-10 text-center text-texto-suave">Nenhum contrato com os filtros atuais.</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Visão por contrato -->
      <div v-else class="cartao overflow-auto" style="max-height: calc(100vh - 380px)">
        <table class="tabela">
          <thead>
            <tr>
              <th class="w-6"></th>
              <th>Contrato</th><th>Fornecedor</th><th>Objeto</th><th>Tipo · venc.</th><th>Fim</th><th>Vigência</th>
              <th class="num">Valor médio</th><th class="num">Média paga*</th><th>Último pagto.</th><th class="num">A pagar*</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="c in linhas" :key="chave(c)">
              <tr class="cursor-pointer" @click="alternar(chave(c))">
                <td class="text-texto-suave">{{ aberto.has(chave(c)) ? '▾' : '▸' }}</td>
                <td class="font-semibold tabular-nums whitespace-nowrap">{{ numeroCurto(c.contrato) }}</td>
                <td>
                  <button class="text-left font-medium" :class="fornecedorPorCodigo.has(c.codFornecedor) ? 'hover:text-marca-600 hover:underline' : 'cursor-default'" @click="abrirFornecedor(c, $event)">
                    {{ fornecedorPorCodigo.get(c.codFornecedor)?.nome ?? c.fornecedor }}
                  </button>
                  <div class="text-xs text-texto-suave">
                    {{ c.codFornecedor }}
                    <span v-if="fornecedorPorCodigo.has(c.codFornecedor)" class="ml-1 rounded-full bg-marca-100 px-1.5 py-0.5 text-[10px] font-bold text-marca-700">ADM</span>
                  </div>
                </td>
                <td class="max-w-96"><div class="line-clamp-2 text-xs text-texto-suave" :title="c.objeto ?? ''">{{ c.objeto ?? '—' }}</div></td>
                <td class="text-xs whitespace-nowrap">{{ c.tipo ?? '—' }}<div class="text-texto-suave">{{ c.tipoVencimento ?? 'não informado' }}</div></td>
                <td class="tabular-nums">{{ data(c.fim) }}</td>
                <td><span class="rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap" :class="vigencia(c).classe">{{ vigencia(c).rotulo }}</span></td>
                <td class="num">{{ c.valorMedio ? moeda(c.valorMedio) : '—' }}</td>
                <td class="num" :class="divergente(c) ? 'font-semibold text-[var(--s-naolancado)]' : ''" :title="divergente(c) ? 'Média paga difere mais de 10% do valor médio do contrato' : ''">
                  {{ c.pagamentos?.mediaRecente ? moeda(c.pagamentos.mediaRecente) : '—' }}
                </td>
                <td class="tabular-nums">{{ data(c.pagamentos?.ultimoPagamento) }}</td>
                <td class="num" :style="c.pagamentos?.aPagar ? 'color: var(--s-lancado); font-weight: 600' : ''">{{ c.pagamentos?.aPagar ? moeda(c.pagamentos.valorAPagar) : '—' }}</td>
              </tr>
              <tr v-if="aberto.has(chave(c))" class="bg-fundo">
                <td></td>
                <td colspan="10" class="py-3">
                  <div class="grid gap-4 text-sm md:grid-cols-3">
                    <div class="md:col-span-2">
                      <div class="rotulo">Objeto</div>
                      <p class="mt-1 whitespace-pre-line">{{ c.objeto ?? '—' }}</p>
                    </div>
                    <dl class="space-y-2">
                      <div><dt class="rotulo">Vigência</dt><dd>{{ data(c.inicio) }} a {{ data(c.fim) }}</dd></div>
                      <div><dt class="rotulo">Processo interno</dt><dd>{{ c.processo ?? '—' }}</dd></div>
                      <div><dt class="rotulo">CPF/CNPJ</dt><dd>{{ cnpj(c.cnpj) }}</dd></div>
                      <div><dt class="rotulo">Natureza</dt><dd>{{ c.natureza ?? '—' }} {{ c.descNatureza ?? '' }}</dd></div>
                      <div><dt class="rotulo">Centro de negócio</dt><dd>{{ c.centroNegocio ?? '—' }}</dd></div>
                    </dl>
                    <div>
                      <div class="rotulo">Produtos</div>
                      <ul class="mt-1 list-disc pl-5 text-xs">
                        <li v-for="p in c.produtos" :key="p.codigo">{{ p.descricao ?? '' }} <span class="text-texto-suave">({{ p.codigo }})</span></li>
                      </ul>
                    </div>
                    <div>
                      <div class="rotulo">Centros de custo</div>
                      <ul class="mt-1 list-disc pl-5 text-xs">
                        <li v-for="x in c.centrosCusto" :key="x.codigo">{{ x.codigo }} {{ x.descricao ?? '' }}</li>
                        <li v-if="!c.centrosCusto.length" class="list-none text-texto-suave">não informado</li>
                      </ul>
                    </div>
                    <div>
                      <div class="rotulo">Pagamentos do fornecedor em {{ hoje.slice(0, 4) }}*</div>
                      <p class="mt-1 text-xs">
                        {{ c.pagamentos?.titulosNoAno ?? 0 }} títulos pagos · <strong>{{ moeda(c.pagamentos?.pagoNoAno ?? 0) }}</strong><br />
                        Último: {{ data(c.pagamentos?.ultimoPagamento) }} {{ c.pagamentos?.ultimoValor ? '· ' + moeda(c.pagamentos.ultimoValor) : '' }}<br />
                        A pagar: {{ c.pagamentos?.aPagar ?? 0 }} títulos · {{ moeda(c.pagamentos?.valorAPagar ?? 0) }}
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
            <tr v-if="!linhas.length"><td colspan="11" class="py-10 text-center text-texto-suave">Nenhum contrato com os filtros atuais.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="text-xs text-texto-suave">
        Pagamentos somados por <strong>fornecedor</strong>, com todos os títulos do Contas a Pagar, porque o título não traz o nº do contrato.
        Média paga = média mensal dos 3 últimos meses com pagamento. * Na visão por fornecedor, o valor médio é a soma dos contratos.
        Na visão por contrato, os pagamentos se repetem nos contratos do mesmo fornecedor.
      </p>
    </template>
  </div>
</template>
