<script setup lang="ts">
// Ícones de linha (traço 2px, 24x24), desenhados à mão para não depender de biblioteca externa.
const props = defineProps<{ nome: string }>()

const CAMINHOS: Record<string, string[]> = {
  painel: ['M3 3h7v9H3z', 'M14 3h7v5h-7z', 'M14 12h7v9h-7z', 'M3 16h7v5H3z'],
  mensal: ['M3 5h18v16H3z', 'M3 10h18', 'M8 3v4', 'M16 3v4', 'M8 14h2', 'M14 14h2', 'M8 18h2'],
  pagamentos: ['M4 4h16v16H4z', 'M8 9h8', 'M8 13h8', 'M8 17h5'],
  atas: ['M6 3h9l4 4v14H6z', 'M15 3v4h4', 'M9 12h7', 'M9 16h7'],
  compras: ['M3 4h2l2.5 11h11L21 7H6.5', 'M9 20h.01', 'M18 20h.01'],
  of: ['M3 7h11v10H3z', 'M14 10h4l3 3v4h-7', 'M7 20h.01', 'M18 20h.01'],
  contratos: ['M9 3h6v3H9z', 'M7 5H5v16h14V5h-2', 'M9 12l2 2 4-4', 'M9 17h6'],
  fornecedores: ['M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M2 21v-1a6 6 0 0 1 12 0v1', 'M16 3.5a4 4 0 0 1 0 7', 'M22 21v-1a6 6 0 0 0-4-5.6'],
  importacoes: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 21h16'],
  recolher: ['M15 6l-6 6 6 6'],
  expandir: ['M9 6l6 6-6 6'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  recarregar: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 4v7h-7'],
}
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-for="(d, i) in CAMINHOS[props.nome] ?? []" :key="i" :d="d" />
  </svg>
</template>
