import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import * as XLSX from 'xlsx'
import type { ArquivoRelatorio } from '../../src/core/index'

export function gravarPasta(pasta: XLSX.WorkBook, caminho: string) {
  writeFileSync(caminho, XLSX.write(pasta, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
}

export function lerBytes(caminho: string): Uint8Array {
  return new Uint8Array(readFileSync(caminho))
}

export function arquivoRelatorio(caminho: string): ArquivoRelatorio {
  const bytes = lerBytes(caminho)
  return {
    nome: basename(caminho),
    bytes,
    geradoEm: statSync(caminho).mtime.toISOString(),
    hash: createHash('sha256').update(bytes).digest('hex'),
  }
}

/** Monta uma aba a partir de cabeçalho + linhas, com largura de colunas e filtro. */
export function abaTabela(cabecalho: readonly string[], linhas: unknown[][], larguras?: number[]): XLSX.WorkSheet {
  const aba = XLSX.utils.aoa_to_sheet([cabecalho as string[], ...linhas], { cellDates: true, dateNF: 'dd/mm/yyyy' })
  aba['!cols'] = cabecalho.map((h, i) => ({ wch: larguras?.[i] ?? Math.min(Math.max(h.length + 2, 12), 50) }))
  if (linhas.length) aba['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: linhas.length, c: cabecalho.length - 1 } }) }
  return aba
}
