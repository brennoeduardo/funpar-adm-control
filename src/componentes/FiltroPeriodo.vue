<script setup lang="ts">
import { fimCompetencia, hojeISO, somarMeses } from '@core/util'

const props = defineProps<{ rotulo?: string }>()
const de = defineModel<string>('de', { default: '' })
const ate = defineModel<string>('ate', { default: '' })

const hoje = hojeISO()
const mes = hoje.slice(0, 7)

function definir(ini: string, fim: string) {
  de.value = ini
  ate.value = fim
}
const esteMes = () => definir(`${mes}-01`, fimCompetencia(mes))
const mesPassado = () => {
  const m = somarMeses(mes, -1)
  definir(`${m}-01`, fimCompetencia(m))
}
const ultimos30 = () => {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  const ini = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  definir(ini, hoje)
}
const limpar = () => definir('', '')
</script>

<template>
  <div class="flex flex-col gap-1">
    <span class="rotulo">{{ props.rotulo ?? 'Período' }}</span>
    <div class="flex flex-wrap items-center gap-2">
      <input v-model="de" type="date" class="campo w-40" title="De" />
      <span class="text-xs text-texto-suave">até</span>
      <input v-model="ate" type="date" class="campo w-40" title="Até" />
      <div class="flex overflow-hidden rounded-full border border-slate-300 text-xs font-semibold">
        <button class="px-2.5 py-1.5 hover:bg-marca-50" @click="esteMes">Este mês</button>
        <button class="border-l border-slate-300 px-2.5 py-1.5 hover:bg-marca-50" @click="mesPassado">Mês passado</button>
        <button class="border-l border-slate-300 px-2.5 py-1.5 hover:bg-marca-50" @click="ultimos30">30 dias</button>
        <button v-if="de || ate" class="border-l border-slate-300 px-2.5 py-1.5 text-[var(--s-vencido)] hover:bg-[var(--s-vencido-bg)]" @click="limpar">Limpar</button>
      </div>
    </div>
  </div>
</template>
