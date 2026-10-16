import * as XLSX from 'xlsx'
import { normalizarChave } from './util'

/** Lê Excel (xlsx/xlsm/xls) ou CSV a partir dos bytes do arquivo. */
export function lerPasta(bytes: Uint8Array, nomeArquivo: string): XLSX.WorkBook {
  if (/\.(csv|txt)$/i.test(nomeArquivo)) {
    const texto = decodificarTexto(bytes)
    const primeira = texto.split(/\r?\n/, 1)[0] ?? ''
    const FS = contar(primeira, ';') >= contar(primeira, ',') ? ';' : ','
    return XLSX.read(texto, { type: 'string', FS, raw: true })
  }
  return XLSX.read(bytes, { type: 'array', cellDates: false })
}

function contar(s: string, c: string): number {
  return s.split(c).length - 1
}

/** UTF-8 quando válido; senão Windows-1252 (padrão das exportações do Protheus). */
function decodificarTexto(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '')
  return new TextDecoder('windows-1252').decode(bytes)
}

export type Linha = Record<string, unknown> & { __linha: number }

/**
 * Localiza a linha de cabeçalho (a primeira que contém todos os `marcadores`) nas
 * primeiras 20 linhas e devolve as linhas seguintes como objetos com chaves normalizadas.
 */
export function linhasComCabecalho(
  aba: XLSX.WorkSheet,
  marcadores: string[],
): { cabecalho: string[]; linhas: Linha[] } | null {
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(aba, { header: 1, raw: true, defval: null, blankrows: false })
  const alvos = marcadores.map(normalizarChave)
  const idx = matriz.slice(0, 20).findIndex((linha) => {
    const chaves = new Set((linha ?? []).map((c) => normalizarChave(String(c ?? ''))))
    return alvos.every((a) => chaves.has(a))
  })
  if (idx < 0) return null
  const cabecalho = (matriz[idx] ?? []).map((c) => normalizarChave(String(c ?? '')))
  const linhas: Linha[] = []
  for (let i = idx + 1; i < matriz.length; i++) {
    const bruta = matriz[i] ?? []
    if (bruta.every((c) => c === null || c === '')) continue
    const obj: Linha = { __linha: i + 1 }
    cabecalho.forEach((h, j) => {
      if (h && !(h in obj && obj[h] !== null)) obj[h] = bruta[j] ?? null
    })
    linhas.push(obj)
  }
  return { cabecalho, linhas }
}

/** Procura em todas as abas a primeira que tenha o cabeçalho esperado. */
export function encontrarTabela(pasta: XLSX.WorkBook, marcadores: string[]) {
  for (const nome of pasta.SheetNames) {
    const aba = pasta.Sheets[nome]
    if (!aba) continue
    const r = linhasComCabecalho(aba, marcadores)
    if (r) return { aba: nome, ...r }
  }
  return null
}
