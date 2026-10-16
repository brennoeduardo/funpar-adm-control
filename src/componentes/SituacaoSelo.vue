<script setup lang="ts">
import { computed } from 'vue'
import { DESCRICAO_SITUACAO, ROTULO_SITUACAO, type Situacao } from '@core/situacao'
import { ESTILO_SITUACAO } from './estilos'

const props = defineProps<{ situacao: Situacao }>()
const e = computed(() => ESTILO_SITUACAO[props.situacao])
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
    :style="{ color: e.cor, background: e.fundo, border: `1px solid ${e.cor}40` }"
    :title="DESCRICAO_SITUACAO[situacao]"
  >
    <span v-if="e.simbolo" class="font-bold">{{ e.simbolo }}</span>
    {{ ROTULO_SITUACAO[situacao] }}
  </span>
</template>
