<script setup lang="ts">
import { ROTULO_VIGENCIA, type Vigencia } from '@core/situacao'
import { ESTILO_VIGENCIA } from './estilos'

defineProps<{ vigencia: Vigencia; dias?: number | null }>()
</script>

<template>
  <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap" :class="ESTILO_VIGENCIA[vigencia]">
    {{ ROTULO_VIGENCIA[vigencia] }}
    <template v-if="dias !== null && dias !== undefined && (vigencia === 'vencendo' || vigencia === 'vencido')">
      &nbsp;· {{ vigencia === 'vencido' ? `há ${-dias} d` : `${dias} d` }}
    </template>
  </span>
</template>
