/**
 * Publica o painel na pasta compartilhada (após `npm run build`):
 *   <destino>/FUNPAR-ADM-Control.html       interface (arquivo único)
 *   <destino>/gerador/gerador.mjs           gerador empacotado (só precisa do Node)
 *   <destino>/gerador/config.json           criado só se não existir
 *   <destino>/gerador/atualizar.cmd         atalho para rodar o gerador (Agendador de Tarefas)
 *   <destino>/dados/  relatorios/entrada/   pastas de trabalho
 * Nunca sobrescreve cadastros.xlsx, config.json nem dados gerados.
 *
 * Uso: npm run publicar -- --destino "G:\...\FUNPAR-ADM-Control" [--local "C:\FUNPAR-ADM-Control\gerador" --rede "\\servidor\...\FUNPAR-ADM-Control"]
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({ options: { destino: { type: 'string' }, local: { type: 'string' }, rede: { type: 'string' } } })
if (!args.destino) {
  console.error('Informe --destino')
  process.exit(1)
}
const destino = args.destino
for (const arq of ['dist/index.html', 'dist/gerador.mjs']) {
  if (!existsSync(arq)) {
    console.error(`${arq} não encontrado. Rode "npm run build" antes.`)
    process.exit(1)
  }
}

for (const p of ['gerador', 'dados/gerado', 'relatorios/entrada', 'relatorios/solicitacoes', 'relatorios/contratos']) mkdirSync(join(destino, p), { recursive: true })

copyFileSync('dist/index.html', join(destino, 'FUNPAR-ADM-Control.html'))
console.log('Atualizado: FUNPAR-ADM-Control.html')


/*
 * Servidor, banco e nomes das views ficam em publicar.config.json (fora do Git — dados da rede interna).
 * Modelo: publicar.config.example.json.
 */
const CAMINHO_INFRA = 'publicar.config.json'
if (!existsSync(CAMINHO_INFRA)) {
  console.error(`${CAMINHO_INFRA} não encontrado. Copie publicar.config.example.json para ${CAMINHO_INFRA} e preencha servidor, banco e views.`)
  process.exit(1)
}
const infra = JSON.parse(readFileSync(CAMINHO_INFRA, 'utf-8')) as {
  servidor: string
  banco: string
  views: { pagamentos: string; solicitacoes: string; contratos: string }
}

/** Origem da view no SQL Server (lida com o login do Windows de quem executa). */
const VIEW_PADRAO = { servidor: infra.servidor, banco: infra.banco, nome: infra.views.pagamentos, arquivo: '../relatorios/entrada/view.csv' }
/** Solicitações abertas: só Atas/Contratos e Formulário de Compras, sem CPF nem dados bancários. */
const SOLICITACOES_PADRAO = {
  nome: infra.views.solicitacoes,
  arquivo: '../relatorios/solicitacoes/solicitacoes.csv',
  origens: ['ATAS E CONTRATOS', 'FORMULÁRIO DE COMPRAS'],
  colunas: ['ORIGEM', 'SOLICITANTE', 'FORNEC_BENEFICIARIO', 'DATA', 'PROTOCOLO', 'DESCRI', 'VALOR', 'DESC_STATUS', 'CENTRO DE CUSTO', 'CONTA_CONTABIL', 'DESC_CONTA_CONTABIL'],
}
/** Contratos dos fornecedores (vigentes) */
const CONTRATOS_PADRAO = { nome: infra.views.contratos, arquivo: '../relatorios/contratos/contratos.csv' }

const config = join(destino, 'gerador', 'config.json')
if (existsSync(config)) {
  const atual = JSON.parse(readFileSync(config, 'utf-8'))
  const faltando = {
    ...(atual.view ? {} : { view: VIEW_PADRAO }),
    ...(atual.solicitacoes ? {} : { solicitacoes: SOLICITACOES_PADRAO }),
    ...(atual.contratos ? {} : { contratos: CONTRATOS_PADRAO }),
  }
  if (Object.keys(faltando).length) {
    writeFileSync(config, JSON.stringify({ ...atual, ...faltando }, null, 2) + '\n')
    console.log(`Atualizado: gerador/config.json (incluído: ${Object.keys(faltando).join(', ')})`)
  }
} else {
  writeFileSync(
    config,
    JSON.stringify(
      {
        pastaRelatorios: '../relatorios/entrada',
        cadastros: '../dados/cadastros.xlsx',
        saida: '../dados/gerado',
        extensoes: ['.xlsx', '.xls', '.csv'],
        segundosMinimosDesdeAlteracao: 60,
        historicoMaximo: 90,
        view: VIEW_PADRAO,
        solicitacoes: SOLICITACOES_PADRAO,
        contratos: CONTRATOS_PADRAO,
      },
      null,
      2,
    ) + '\n',
  )
  console.log('Criado: gerador/config.json')
}

/** Grava os scripts do executor (gerador, extração da view e atalhos) numa pasta. */
function escreverExecutor(pasta: string) {
  mkdirSync(pasta, { recursive: true })
  copyFileSync('dist/gerador.mjs', join(pasta, 'gerador.mjs'))
  // PowerShell 5.1 só lê acentos corretamente em scripts UTF-8 com BOM.
  const ps1 = readFileSync('scripts/extrair-view.ps1', 'utf-8').replace(/^﻿/, '')
  writeFileSync(join(pasta, 'extrair-view.ps1'), '﻿' + ps1, 'utf-8')
  writeFileSync(
    join(pasta, 'atualizar.cmd'),
    [
      '@echo off',
      'rem Atualiza os dados do FUNPAR ADM Control com os arquivos que ja estao na pasta de relatorios.',
      'rem Para reler todos os relatorios do zero: atualizar.cmd --reprocessar',
      'pushd "%~dp0"',
      'node gerador.mjs --config config.json %*',
      'set ERRO=%ERRORLEVEL%',
      'popd',
      'exit /b %ERRO%',
      '',
    ].join('\r\n'),
  )
  // Rotina automática: extrai as views e atualiza o painel em seguida.
  writeFileSync(
    join(pasta, 'atualizar-auto.cmd'),
    [
      '@echo off',
      'rem Extrai as views do SQL Server e atualiza o painel. Chamado pelo Agendador de Tarefas (via atualizar-oculto.vbs).',
      'pushd "%~dp0"',
      'powershell -NoProfile -ExecutionPolicy Bypass -File extrair-view.ps1 -Config config.json',
      'if errorlevel 1 goto fim',
      'node gerador.mjs --config config.json --imediato',
      ':fim',
      'set ERRO=%ERRORLEVEL%',
      'popd',
      'exit /b %ERRO%',
      '',
    ].join('\r\n'),
  )
  // Executa a rotina sem abrir janela (para não piscar na tela a cada 30 minutos).
  writeFileSync(
    join(pasta, 'atualizar-oculto.vbs'),
    [
      "' Roda atualizar-auto.cmd sem janela. Usado pelo Agendador de Tarefas.",
      'Set fso = CreateObject("Scripting.FileSystemObject")',
      'pasta = fso.GetParentFolderName(WScript.ScriptFullName)',
      'CreateObject("WScript.Shell").Run """" & pasta & "\\atualizar-auto.cmd""", 0, True',
      '',
    ].join('\r\n'),
  )
}

escreverExecutor(join(destino, 'gerador'))
console.log('Atualizados: gerador/ (gerador.mjs, extrair-view.ps1, atualizar.cmd, atualizar-auto.cmd, atualizar-oculto.vbs)')

/*
 * Executor local (--local): o Windows mostra "Aviso de Segurança" ao executar scripts direto da pasta de rede.
 * A cópia local no C: roda sem aviso e lê/grava os dados na rede por caminho absoluto (--rede, de preferência UNC).
 * O config.json local é sempre regenerado a partir do config da rede.
 */
if (args.local) {
  const rede = join(args.rede ?? destino, 'gerador')
  const cfg = JSON.parse(readFileSync(join(destino, 'gerador', 'config.json'), 'utf-8'))
  const abs = (p: string) => resolve(rede, p)
  const comArquivo = (sec: { arquivo: string } | undefined) => (sec ? { ...sec, arquivo: abs(sec.arquivo) } : undefined)
  const local = {
    ...cfg,
    pastaRelatorios: abs(cfg.pastaRelatorios),
    cadastros: abs(cfg.cadastros),
    saida: abs(cfg.saida),
    view: comArquivo(cfg.view),
    solicitacoes: comArquivo(cfg.solicitacoes),
    contratos: comArquivo(cfg.contratos),
  }
  escreverExecutor(args.local)
  writeFileSync(join(args.local, 'config.json'), JSON.stringify(local, null, 2) + '\n')
  console.log(`Executor local atualizado em ${args.local} (dados em ${resolve(rede, '..')})`)
}
