import type { Cadastros, Candidato, Cobertura, Contrato, DadosADM, Fornecedor, Titulo, TituloVinculado } from './tipos'
import { competenciaDe } from './util'

/** Fornecedor interno do Protheus (transferências, repasses) — nunca é candidato a cadastro. */
const FORNECEDOR_INTERNO = '000000'

function atende(codigo: string, loja: string | null, t: Titulo): boolean {
  return codigo === t.fornecedor && (loja === null || loja === t.loja)
}

function vigenteEm(c: Contrato, dataISO: string | null): boolean {
  if (!dataISO) return true
  return (!c.dataInicio || c.dataInicio <= dataISO) && (!c.dataFim || dataISO <= c.dataFim)
}

function diferencaPct(valor: number, referencia: number): number {
  return (Math.abs(valor - referencia) / referencia) * 100
}

interface Rascunho {
  t: Titulo
  competencia: string | null
  candidatos: Contrato[]
  foraVigencia: boolean
  vinculo: TituloVinculado['motivoVinculo']
  contrato: Contrato | null
  observacaoAjuste: string | null
}

/**
 * Cruza os títulos do Protheus com os cadastros:
 * filtra o escopo (fornecedores cadastrados), define a competência e vincula cada título a um contrato.
 */
export function conciliar(
  cadastros: Cadastros,
  titulos: Iterable<Titulo>,
  coberturas: Cobertura[],
  opcoes: { geradoEm: string; origem: DadosADM['origem'] },
): DadosADM {
  const fornecedores = cadastros.fornecedores
  const contratosAtivos = cadastros.contratos.filter((c) => c.ativo)
  const contratoPorNumero = new Map(cadastros.contratos.map((c) => [c.numero, c]))
  const ajustes = new Map(cadastros.ajustes.map((a) => [a.chaveTitulo, a]))

  const noEscopo: Rascunho[] = []
  const fora: Titulo[] = []

  for (const t of titulos) {
    const fornecedor = fornecedores.find((f) => atende(f.codigo, f.loja, t))
    if (!fornecedor) {
      fora.push(t)
      continue
    }
    const ajuste = ajustes.get(t.chave)
    const doFornecedor = contratosAtivos.filter((c) => atende(c.codFornecedor, c.loja, t))
    const vigentes = doFornecedor.filter((c) => vigenteEm(c, t.emissao))
    const r: Rascunho = {
      t,
      competencia: ajuste?.competencia ?? competenciaDe(t.emissao),
      candidatos: vigentes.length ? vigentes : doFornecedor,
      foraVigencia: vigentes.length === 0 && doFornecedor.length > 0,
      vinculo: 'nenhum',
      contrato: null,
      observacaoAjuste: ajuste?.observacao ?? null,
    }
    const forcado = ajuste?.contrato ? contratoPorNumero.get(ajuste.contrato) : undefined
    if (forcado) {
      r.contrato = forcado
      r.vinculo = 'ajuste'
      r.foraVigencia = !vigenteEm(forcado, t.emissao)
    } else if (r.candidatos.length === 1) {
      r.contrato = r.candidatos[0]!
      r.vinculo = 'unico'
    }
    noEscopo.push(r)
  }

  vincularPorValor(noEscopo.filter((r) => r.vinculo === 'nenhum' && r.candidatos.length > 1))

  const vinculados: TituloVinculado[] = noEscopo.map((r) => ({
    ...r.t,
    contrato: r.contrato?.numero ?? null,
    competencia: r.competencia,
    motivoVinculo: r.vinculo,
    alertas: alertasDe(r),
    observacaoAjuste: r.observacaoAjuste,
  }))
  vinculados.sort((a, b) => (b.vencimentoReal ?? '').localeCompare(a.vencimentoReal ?? '') || a.chave.localeCompare(b.chave))

  return {
    versao: 1,
    geradoEm: opcoes.geradoEm,
    origem: opcoes.origem,
    coberturas: [...coberturas].sort((a, b) => b.geradoEm.localeCompare(a.geradoEm)),
    fornecedores: cadastros.fornecedores,
    contratos: cadastros.contratos,
    rateios: cadastros.rateios,
    ajustes: cadastros.ajustes,
    titulos: vinculados,
    ignorados: fora.length,
    candidatos: candidatosDe(fora, cadastros.contratos),
    problemas: cadastros.problemas,
    falhas: [],
  }
}

/**
 * Fornecedor com vários contratos: o relatório não traz o nº do contrato,
 * então o vínculo é pelo valor mais próximo da referência, dentro da tolerância,
 * no máximo um título por contrato por competência. O que sobrar fica "não vinculado".
 */
function vincularPorValor(pendentes: Rascunho[]) {
  const grupos = new Map<string, Rascunho[]>()
  for (const r of pendentes) {
    const g = `${r.t.fornecedor}|${r.t.loja}|${r.competencia}`
    grupos.set(g, [...(grupos.get(g) ?? []), r])
  }
  for (const grupo of grupos.values()) {
    const pares: { r: Rascunho; c: Contrato; dif: number }[] = []
    for (const r of grupo) {
      for (const c of r.candidatos) {
        if (!c.valorReferencia) continue
        const dif = diferencaPct(r.t.valor, c.valorReferencia)
        if (dif <= c.toleranciaPct) pares.push({ r, c, dif })
      }
    }
    pares.sort((a, b) => a.dif - b.dif)
    const usados = new Set<string>()
    for (const p of pares) {
      if (p.r.contrato || usados.has(p.c.numero)) continue
      p.r.contrato = p.c
      p.r.vinculo = 'valor'
      usados.add(p.c.numero)
    }
  }
}

function alertasDe(r: Rascunho): string[] {
  const a: string[] = []
  const c = r.contrato
  if (!c) {
    a.push(r.candidatos.length
      ? `Fornecedor com ${r.candidatos.length} contratos e nenhum valor de referência compatível: vincular na aba Ajustes`
      : 'Fornecedor sem contrato ativo cadastrado')
    return a
  }
  if (r.foraVigencia) a.push(`Emissão fora da vigência do contrato ${c.numero}`)
  if (c.valorReferencia && r.vinculo !== 'valor') {
    const dif = diferencaPct(r.t.valor, c.valorReferencia)
    if (dif > c.toleranciaPct) a.push(`Valor ${dif.toFixed(0)}% diferente da referência do contrato`)
  }
  if (c.natureza && r.t.natureza && c.natureza !== r.t.natureza) a.push(`Natureza ${r.t.natureza} ≠ cadastro ${c.natureza}`)
  if (c.contaPag && /^\d+$/.test(c.contaPag) && r.t.contaPag && c.contaPag !== r.t.contaPag) a.push(`Conta pagadora ${r.t.contaPag} ≠ cadastro ${c.contaPag}`)
  return a
}

/** Fornecedores fora do cadastro que parecem ADM: mesma conta pagadora e natureza dos contratos cadastrados. */
function candidatosDe(fora: Titulo[], contratos: Contrato[]): Candidato[] {
  const contas = new Set(contratos.map((c) => c.contaPag).filter((v): v is string => !!v && /^\d+$/.test(v)))
  const naturezas = new Set(contratos.map((c) => c.natureza).filter((v): v is string => !!v))
  const mapa = new Map<string, Candidato & { _nat: Set<string> }>()
  for (const t of fora) {
    if (t.fornecedor === FORNECEDOR_INTERNO) continue
    const contaOk = !!t.contaPag && contas.has(t.contaPag)
    const natOk = !!t.natureza && naturezas.has(t.natureza)
    if (!contaOk || !natOk) continue
    const chave = `${t.fornecedor}|${t.loja}`
    const c = mapa.get(chave) ?? { codigo: t.fornecedor, loja: t.loja, nome: t.razaoSocial, cnpj: t.cnpj, quantidade: 0, total: 0, naturezas: [], _nat: new Set<string>() }
    c.quantidade++
    c.total += t.valor
    if (t.natureza) c._nat.add(t.natureza)
    mapa.set(chave, c)
  }
  return [...mapa.values()]
    .map(({ _nat, ...c }) => ({ ...c, total: Math.round(c.total * 100) / 100, naturezas: [..._nat] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 200)
}

export function fornecedorDoContrato(fornecedores: Fornecedor[], c: Contrato): Fornecedor | undefined {
  return fornecedores.find((f) => f.codigo === c.codFornecedor && (f.loja === null || c.loja === null || f.loja === c.loja))
    ?? fornecedores.find((f) => f.codigo === c.codFornecedor)
}
