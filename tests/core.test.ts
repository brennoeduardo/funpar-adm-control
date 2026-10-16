import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { conciliar, importarRelatorios, LAYOUT, lerCadastros, type Cadastros, type Contrato, type Titulo } from '../src/core/index'
import { competenciaCoberta, montarMatriz, situacaoCelula, vigenciaDe } from '../src/core/situacao'
import { dataISO, documento, protocolo } from '../src/core/util'

const contrato = (p: Partial<Contrato>): Contrato => ({
  numero: '1', codFornecedor: '900001', loja: null, processo: null, objeto: null, produto: null, tipo: null,
  periodicidade: 'MENSAL', valorReferencia: null, toleranciaPct: 10, diaVencimento: null, vencimentoTexto: null,
  dataInicio: '2024-01-01', dataFim: '2027-12-31', natureza: null, contaPag: null, centroCusto: null,
  tipoEntrada: null, especieDoc: null, retemImposto: null, ativo: true, observacoes: null, ...p,
})

const titulo = (p: Partial<Titulo>): Titulo => ({
  chave: p.numero ?? 'x', filial: 'F', prefixo: '000', numero: '1', parcela: '', tipo: 'NF', fornecedor: '900001', loja: '0001',
  razaoSocial: 'FORNECEDOR TESTE', cnpj: null, emissao: '2026-09-04', lancamento: '2026-09-05', vencimento: '2026-09-25', vencimentoReal: '2026-09-25',
  valor: 0, saldo: 0, baixa: '2026-09-22', protocolo: null, natureza: null, contaPag: null, historico: null,
  liberacao: null, bordero: null, usuario: null, retencoes: { iss: 0, irrf: 0, inss: 0, pis: 0, cofins: 0, csll: 0 },
  origem: { arquivo: 'a.xlsx', geradoEm: '2026-10-01T00:00:00Z' }, ...p,
})

const cadastros = (contratos: Contrato[]): Cadastros => ({
  fornecedores: [{ codigo: '900001', loja: null, cnpj: null, razaoSocial: 'FORNECEDOR TESTE', nome: 'FORNECEDOR TESTE', formaPagamento: null, solicitante: null, ativo: true, observacoes: null }],
  contratos, rateios: [], ajustes: [], problemas: [],
})

describe('normalização', () => {
  it('protocolo do Protheus e da planilha viram o mesmo número', () => {
    expect(protocolo('0000123456-0000')).toBe('123456')
    expect(protocolo(123456)).toBe('123456')
  })
  it('CNPJ zerado (estrangeiro) vira null e máscara é removida', () => {
    expect(documento('00000000000000')).toBeNull()
    expect(documento('11.222.333/0001-81')).toBe('11222333000181')
  })
  it('datas em serial do Excel e dd/mm/aaaa', () => {
    expect(dataISO(46267)).toBe('2026-09-02')
    expect(dataISO('02/09/2026')).toBe('2026-09-02')
  })
})

describe('importação', () => {
  function arquivo(nome: string, linhas: unknown[][], geradoEm: string) {
    const ws = XLSX.utils.aoa_to_sheet([['Listagem do Browse'], ['Filial', 'Prefixo', 'No. Titulo', 'Parcela', 'Tipo', 'Fornecedor', 'Loja', 'Vlr.Titulo', 'Vencimento', 'DT Baixa', 'Saldo'], ...linhas])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Listagem do Browse')
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
    return { nome, bytes, geradoEm, hash: nome + geradoEm }
  }

  it('não duplica títulos entre relatórios e mantém a versão mais recente', () => {
    const a = arquivo('a.xlsx', [['F', '000', '000000001', '', 'NF', '900001', '0001', 100, '10/09/2026', '', 100]], '2026-09-10T00:00:00Z')
    const b = arquivo('b.xlsx', [['F', '000', '000000001', '', 'NF', '900001', '0001', 100, '10/09/2026', '09/09/2026', 0]], '2026-09-20T00:00:00Z')
    const r = importarRelatorios({ titulos: [], coberturas: [] }, [b, a], '2026-10-01T00:00:00Z')
    expect(r.titulos).toHaveLength(1)
    expect(r.titulos[0]!.baixa).toBe('2026-09-09')
    expect(r.coberturas.map((c) => c.tipo)).toEqual(['abertos', 'baixados'])
  })

  it('pula arquivo já importado (mesmo hash) e não registra arquivo ilegível', () => {
    const a = arquivo('a.xlsx', [['F', '000', '1', '', 'NF', '900001', '0001', 100, '10/09/2026', '09/09/2026', 0]], '2026-09-10T00:00:00Z')
    const r1 = importarRelatorios({ titulos: [], coberturas: [] }, [a], 'x')
    const ruim = { nome: 'ruim.xlsx', bytes: new Uint8Array([1, 2, 3]), geradoEm: 'y', hash: 'h' }
    const r2 = importarRelatorios(r1, [a, ruim], 'x')
    expect(r2.pulados).toEqual(['a.xlsx'])
    expect(r2.falhas).toHaveLength(1)
    expect(r2.coberturas).toHaveLength(1)
  })
})

describe('conciliação', () => {
  it('fornecedor com vários contratos: vincula pelo valor mais próximo, um título por contrato', () => {
    const cads = cadastros([
      contrato({ numero: 'C1', valorReferencia: 1000 }),
      contrato({ numero: 'C2', valorReferencia: 600 }),
      contrato({ numero: 'C3', valorReferencia: 120 }),
    ])
    const ts = [
      titulo({ chave: 'a', valor: 1050 }),
      titulo({ chave: 'b', valor: 610 }),
      titulo({ chave: 'c', valor: 120 }),
      titulo({ chave: 'd', valor: 400 }),
    ]
    const d = conciliar(cads, ts, [], { geradoEm: 'x', origem: 'manual' })
    const por = Object.fromEntries(d.titulos.map((t) => [t.chave, t.contrato]))
    expect(por).toEqual({ a: 'C1', b: 'C2', c: 'C3', d: null })
  })

  it('títulos de fornecedores fora do cadastro são ignorados', () => {
    const d = conciliar(cadastros([contrato({})]), [titulo({ fornecedor: '999999' })], [], { geradoEm: 'x', origem: 'manual' })
    expect(d.titulos).toHaveLength(0)
    expect(d.ignorados).toBe(1)
  })

  it('ajuste manual força contrato e competência', () => {
    const cads = cadastros([contrato({ numero: 'A', valorReferencia: 10 }), contrato({ numero: 'B', valorReferencia: 20 })])
    cads.ajustes = [{ chaveTitulo: 'k', contrato: 'B', competencia: '2026-08', observacao: null }]
    const d = conciliar(cads, [titulo({ chave: 'k', valor: 999 })], [], { geradoEm: 'x', origem: 'manual' })
    expect(d.titulos[0]).toMatchObject({ contrato: 'B', competencia: '2026-08', motivoVinculo: 'ajuste' })
  })
})

describe('situação', () => {
  const cob = [{ arquivo: 'a', hash: 'h', geradoEm: '2026-10-01T00:00:00Z', importadoEm: '', layout: 'FINA750', tipo: 'baixados' as const, baixaIni: '2026-09-01', baixaFim: '2026-09-30', emissaoIni: '2026-05-07', emissaoFim: '2026-09-30', linhas: 1, erros: [] }]

  it('relatório só de pagos não transforma ausência em pendência nem em não lançado', () => {
    expect(situacaoCelula(true, '2026-09', [], cob, '2026-10-14')).toBe('sem_registro')
    expect(situacaoCelula(true, '2026-08', [], cob, '2026-10-14')).toBe('fora_cobertura')
    expect(competenciaCoberta('2026-10', cob)).toBe(false)
  })

  it('relatório com pagos e em aberto permite afirmar "não lançado"', () => {
    const completo = [{ ...cob[0]!, tipo: 'misto' as const, emissaoIni: '2026-01-02', emissaoFim: '2026-09-30' }]
    expect(situacaoCelula(true, '2026-03', [], completo, '2026-10-14')).toBe('nao_lancado')
    expect(situacaoCelula(false, '2026-03', [], completo, '2026-10-14')).toBe('nao_previsto')
  })

  it('cobertura soma relatórios de meses diferentes', () => {
    const agosto = { ...cob[0]!, hash: 'h2', baixaIni: '2026-08-03', baixaFim: '2026-08-31' }
    expect(competenciaCoberta('2026-08', [...cob, agosto])).toBe(true)
    expect(competenciaCoberta('2026-07', [...cob, agosto])).toBe(false)
  })

  it('lançado a pagar, vencido e pago', () => {
    const t = { ...titulo({}), contrato: null, competencia: '2026-09', motivoVinculo: 'nenhum' as const, alertas: [], observacaoAjuste: null }
    expect(situacaoCelula(true, '2026-09', [t], cob, '2026-10-14')).toBe('pago')
    expect(situacaoCelula(true, '2026-09', [{ ...t, saldo: 10, baixa: null, vencimentoReal: '2026-10-20' }], cob, '2026-10-14')).toBe('lancado')
    expect(situacaoCelula(true, '2026-09', [{ ...t, saldo: 10, baixa: null }], cob, '2026-10-14')).toBe('vencido')
  })

  it('matriz por fornecedor reúne títulos de todos os contratos', () => {
    const cads = cadastros([contrato({ numero: 'A' }), contrato({ numero: 'B' })])
    const d = conciliar(cads, [titulo({ chave: 'a', valor: 1 }), titulo({ chave: 'b', valor: 2 })], cob, { geradoEm: 'x', origem: 'manual' })
    const [linha] = montarMatriz(d, ['2026-09'], '2026-10-14')
    expect(linha!.celulas['2026-09']).toMatchObject({ situacao: 'pago', valor: 3 })
  })

  it('vigência do contrato (controle de contratos em espera)', () => {
    expect(vigenciaDe(contrato({ dataFim: '2026-08-31' }), '2026-10-14').vigencia).toBe('vencido')
  })
})

describe('cadastros.xlsx', () => {
  it('valida relações e formatos', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...LAYOUT.Fornecedores], ['900001', '', '', 'FORNECEDOR TESTE', '', '', '', '', 'S', '']]), 'Fornecedores')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      [...LAYOUT.Contratos],
      ['1', '900001', '', '', '', '', '', 'MENSAL', 100, '', 10, '', '', '', '', '', '', '', '', '', 'S', ''],
      ['2', '111111', '', '', '', '', '', 'QUINZENAL', 100, '', '', '', '', '', '', '', '', '', '', '', 'S', ''],
    ]), 'Contratos')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...LAYOUT.Rateio], ['1', 'CC1', 60], ['1', 'CC2', 30]]), 'Rateio')
    const c = lerCadastros(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer))
    expect(c.fornecedores).toHaveLength(1)
    expect(c.contratos).toHaveLength(1)
    const msgs = c.problemas.map((p) => p.mensagem).join('\n')
    expect(msgs).toMatch(/Periodicidade inválida/)
    expect(msgs).toMatch(/soma 90\.00%/)
  })
})

describe('view do Contas a Pagar (TI)', () => {
  const CAB_VIEW = ['FILIAL', 'PREFIXO', 'NUMERO', 'PARCELA', 'TIPO', 'COD FORN', 'LJ FORN', 'RAZAO SOCIAL', 'CNPJ/CPF', 'EMISSAO', 'DT CONTAB', 'VENCTO', 'VENCTO REAL', 'DT LIBERA', 'BAIXA', 'VALOR', 'SALDO', 'NATUREZ', 'CONTA PAG', 'PROTOC', 'HIST', 'NUM BORDERO', 'ISS', 'IRRF', 'INSS', 'PIS', 'COFINS', 'CSLL']
  function planilha(nome: string, cab: string[], linhas: unknown[][], geradoEm: string) {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), 'Planilha1')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cab, ...linhas]), 'Planilha2')
    return { nome, bytes: new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer), geradoEm, hash: nome + geradoEm }
  }
  const linhaView = (num: string, baixa: string, saldo: number) =>
    ['010100001', '000', num, '   ', 'NF ', '900001', '0001', 'FORNECEDOR TESTE', '11222333000181', '20260904', '20260905', '20260925', '20260925', '        ', baixa, 100, saldo, '20804     ', '8533      ', '00001234560000', '   ', '      ', 0, 0, 0, 0, 0, 0]

  it('lê datas AAAAMMDD, espaços vazios e protocolo sem hífen', () => {
    const r = importarRelatorios({ titulos: [], coberturas: [] }, [planilha('view.xlsx', CAB_VIEW, [linhaView('000001047', '20260922', 0)], '2026-10-16T08:00:00Z')], 'x')
    const t = r.titulos[0]!
    expect(r.coberturas[0]).toMatchObject({ layout: 'VIEW_SE2', completo: true })
    expect(t).toMatchObject({ filial: '010100001', emissao: '2026-09-04', lancamento: '2026-09-05', baixa: '2026-09-22', liberacao: null, protocolo: '123456', natureza: '20804', parcela: '' })
  })

  it('mesmo título no FINA750 e na view não duplica (filial com e sem descrição)', () => {
    const fina = planilha('fina750.xlsx', ['Filial', 'Prefixo', 'No. Titulo', 'Parcela', 'Tipo', 'Fornecedor', 'Loja', 'Vlr.Titulo', 'Vencimento', 'DT Baixa', 'Saldo'],
      [['010100001-FUNPAR ADM', '000', '000001047', '', 'NF', '900001', '0001', 100, '25/09/2026', '', 100]], '2026-10-01T00:00:00Z')
    const view = planilha('view.xlsx', CAB_VIEW, [linhaView('000001047', '20260922', 0)], '2026-10-16T08:00:00Z')
    const r = importarRelatorios({ titulos: [], coberturas: [] }, [fina, view], 'x')
    expect(r.titulos).toHaveLength(1)
    expect(r.titulos[0]!.baixa).toBe('2026-09-22')
  })

  it('título excluído no Protheus (ausente na view mais nova) sai do painel', () => {
    const antiga = planilha('view1.xlsx', CAB_VIEW, [linhaView('000000001', '        ', 100), linhaView('000000002', '        ', 100)], '2026-10-15T08:00:00Z')
    const nova = planilha('view2.xlsx', CAB_VIEW, [linhaView('000000001', '20261016', 0)], '2026-10-16T08:00:00Z')
    const r = importarRelatorios({ titulos: [], coberturas: [] }, [antiga, nova], 'x')
    expect(r.titulos.map((t) => t.numero)).toEqual(['000000001'])
    expect(r.processados.at(-1)!.removidos).toBe(1)
  })
})

describe('migração do estado guardado', () => {
  it('títulos antigos com filial descrita são unificados com os da view', () => {
    const antigo = titulo({ filial: '010100001-FUNPAR ADM', chave: '010100001-FUNPAR ADM|000|1||NF|900001|0001', numero: '1', prefixo: '000', baixa: null, saldo: 10 })
    const r = importarRelatorios({ titulos: [antigo], coberturas: [] }, [], 'x')
    expect(r.titulos[0]!.chave).toBe('010100001|000|1||NF|900001|0001')
  })
})

describe('solicitações abertas', () => {
  it('lê o CSV da view e liga ao cadastro pelo nome do fornecedor', async () => {
    const { lerSolicitacoes, vincularFornecedores } = await import('../src/core/solicitacoes')
    const csv = [
      'ORIGEM;SOLICITANTE;FORNEC_BENEFICIARIO;DATA;PROTOCOLO;DESCRI;VALOR;DESC_STATUS;CENTRO DE CUSTO;CONTA_CONTABIL;DESC_CONTA_CONTABIL',
      'ATAS E CONTRATOS;SOLICITANTE A;12.345.678 FULANO DE TAL;2026-11-13;00009876540000;SERVICO PESSOA JURIDICA;5500;PENDENTE - APROVAÇÃO GERENTE ADMINISTRATIVO;1107030005;321010300008;(-) DESP',
      'FORMULÁRIO DE COMPRAS;SOLICITANTE B;GRAFICA EXEMPLO LTDA;2026-10-13;00005555550000;"PLOTAGEM; A0";350.4;EM PROCESSO DE COMPRAS;1106020119;;',
    ].join('\n')
    const r = lerSolicitacoes(new TextEncoder().encode(csv), 'solicitacoes.csv')
    expect(r.itens).toHaveLength(2)
    expect(r.itens[0]).toMatchObject({ protocolo: '987654', data: '2026-11-13', valor: 5500, origem: 'ATAS E CONTRATOS' })
    expect(r.itens[1]).toMatchObject({ origem: 'FORMULÁRIO DE COMPRAS', descricao: 'PLOTAGEM; A0', contaContabil: null })
    const f = { codigo: 'A00001', loja: '0001', cnpj: null, razaoSocial: '12.345.678 FULANO DE TAL', nome: 'FULANO DE TAL', formaPagamento: null, solicitante: null, ativo: true, observacoes: null }
    const v = vincularFornecedores(r.itens, [f])
    expect(v.map((s) => s.codFornecedor)).toEqual(['A00001', null])
  })
})

describe('contratos do Protheus', () => {
  it('agrupa linhas por contrato sem somar o valor médio e resume pagamentos do fornecedor', async () => {
    const { lerContratosProtheus, resumirPagamentos } = await import('../src/core/contratosProtheus')
    const cab = 'COD. FORNECEDOR;CPF/CNPJ;NOME FORNECEDOR;CONTRATO;PROCESSO INTERNO;DATA INICIO;DATA FIM;COD. PRODUTO;DESCRI. PRODUTO;OBJETO;COD. CENTRO CUSTO;DESCRI. CENTRO CUSTO;CENTRO NEGOCIO;DESCRI. CENTRO NEGOCIO;COD. NATUREZA;DESCRI. NATUREZA;TIPO CONTRATO;TIPO VENCIMENTO;VALOR MÉDIO'
    const csv = [cab,
      '900002;44555666000199;CLINICA EXEMPLO;CT001/2021;;2021-10-01;2026-11-25;1036000017;EXAME DE AUDIOMETRIA;CT 001\\13\\10EXAMES;1107030006;UNISEG;6;ADMINISTRAÇÃO;20804;STPJ;FORNECEDOR;PERIÓDICO;496.19',
      '900002;44555666000199;CLINICA EXEMPLO;CT001/2021;;2021-10-01;2026-11-25;1036000018;EXAME DE ECG;CT 001\\13\\10EXAMES;1107030006;UNISEG;6;ADMINISTRAÇÃO;20804;STPJ;FORNECEDOR;PERIÓDICO;496.19',
    ].join('\n')
    const r = lerContratosProtheus(new TextEncoder().encode(csv), 'contratos.csv')
    expect(r.contratos).toHaveLength(1)
    expect(r.contratos[0]).toMatchObject({ contrato: 'CT001/2021', codFornecedor: '900002', valorMedio: 496.19, fim: '2026-11-25', objeto: 'CT 001 EXAMES', tipoVencimento: 'PERIÓDICO' })
    expect(r.contratos[0]!.produtos).toHaveLength(2)
    const pago = titulo({ fornecedor: '900002', chave: 'a', valor: 200, baixa: '2026-09-10', saldo: 0 })
    const aberto = titulo({ fornecedor: '900002', chave: 'b', valor: 300, baixa: null, saldo: 300 })
    const res = resumirPagamentos([pago, aberto], new Set(['900002']), '2026-10-16').get('900002')!
    expect(res).toMatchObject({ pagoNoAno: 200, titulosNoAno: 1, ultimoPagamento: '2026-09-10', aPagar: 1, valorAPagar: 300, mediaRecente: 200 })
  })
})
