<#
  FUNPAR ADM Control — extrai as views do SQL Server para CSV, para o gerador importar:
    - "view":          Contas a Pagar                       -> relatorios\entrada\view.csv
    - "solicitacoes":  Solicitações abertas, só as origens configuradas
                       -> relatorios\solicitacoes\solicitacoes.csv
    - "contratos":     Contratos dos fornecedores
                       -> relatorios\contratos\contratos.csv
    - "ofs":           Ordens de Fornecimento abertas, só as colunas configuradas
                       -> relatorios\ofs\ofs.csv

  Usa o login do Windows de quem executa (Integrated Security): nenhuma senha é guardada.
  Configuração nas seções "view", "solicitacoes", "contratos" e "ofs" do config.json (ao lado deste script).

  Uso: powershell -NoProfile -File extrair-view.ps1 [-Config config.json]
#>
param([string]$Config = (Join-Path $PSScriptRoot 'config.json'))

$ErrorActionPreference = 'Stop'
$cfg = Get-Content $Config -Raw -Encoding UTF8 | ConvertFrom-Json
$base = Split-Path -Parent (Resolve-Path $Config)
# Caminhos do config podem ser relativos à pasta do config ou absolutos (ex.: \\servidor\pasta, quando o
# executor roda de uma cópia local no C: e os dados ficam na rede).
function Caminho([string]$p) { return [IO.Path]::GetFullPath([IO.Path]::Combine($base, $p)) }
if ($null -eq $cfg.view) { throw 'Seção "view" ausente no config.json' }

# Trava: se a pasta de dados (rede) estiver inacessível, não grava nada — senão a extração recriaria
# uma árvore de pastas vazia no lugar errado. Registra num log local, ao lado do script.
if (-not (Test-Path -LiteralPath (Caminho $cfg.cadastros))) {
  $msg = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + " pasta de dados inacessível ($(Caminho $cfg.cadastros) não encontrado): nada foi extraído"
  [IO.File]::AppendAllText((Join-Path $PSScriptRoot 'acesso.log'), $msg + "`r`n", (New-Object Text.UTF8Encoding($false)))
  Write-Output $msg
  exit 1
}

$log = [IO.Path]::GetFullPath([IO.Path]::Combine((Caminho $cfg.saida), 'gerador.log'))
function Log([string]$msg) {
  $linha = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ') + ' ' + $msg
  Write-Output $linha
  [IO.File]::AppendAllText($log, $linha + "`n", (New-Object Text.UTF8Encoding($false)))
}

$inv = [Globalization.CultureInfo]::InvariantCulture
function Campo($valor) {
  if ($valor -is [DBNull] -or $null -eq $valor) { return '' }
  if ($valor -is [double] -or $valor -is [decimal] -or $valor -is [single]) { return $valor.ToString($inv) }
  if ($valor -is [datetime]) { return $valor.ToString('yyyy-MM-dd', $inv) }
  $s = ([string]$valor).Trim()
  if ($s -match '[;"\r\n]') { return '"' + $s.Replace('"', '""').Replace("`r", ' ').Replace("`n", ' ') + '"' }
  return $s
}

function Validar([string]$nome, [string]$padrao, [string]$o) {
  if ($nome -notmatch $padrao) { throw "$o inválido: $nome" }
}

<#
  Executa a consulta e grava o CSV de forma atômica (arquivo temporário + renomear):
  o gerador nunca lê um arquivo pela metade.
#>
function Extrair($con, [string]$sql, [hashtable]$parametros, [string]$destino) {
  $cmd = $con.CreateCommand()
  $cmd.CommandText = $sql
  $cmd.CommandTimeout = 300
  foreach ($k in $parametros.Keys) { [void]$cmd.Parameters.AddWithValue($k, $parametros[$k]) }
  $r = $cmd.ExecuteReader()
  $sb = New-Object Text.StringBuilder
  $nomes = 0..($r.FieldCount - 1) | ForEach-Object { Campo $r.GetName($_) }
  [void]$sb.AppendLine(($nomes -join ';'))
  $n = 0
  $valores = New-Object 'object[]' $r.FieldCount
  while ($r.Read()) {
    [void]$r.GetValues($valores)
    [void]$sb.AppendLine((($valores | ForEach-Object { Campo $_ }) -join ';'))
    $n++
  }
  $r.Close()
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destino)) | Out-Null
  $tmp = "$destino.tmp"
  [IO.File]::WriteAllText($tmp, $sb.ToString(), (New-Object Text.UTF8Encoding($true)))
  Move-Item -Force $tmp $destino
  return $n
}

$v = $cfg.view
$cs = "Server=$($v.servidor);Database=$($v.banco);Integrated Security=SSPI;Connect Timeout=30;Application Name=FUNPAR-ADM-Control"
$con = New-Object System.Data.SqlClient.SqlConnection $cs
try {
  $con.Open()

  # 1) Contas a Pagar — obrigatório. Ordem fixa (chave do título): mesmo conteúdo = mesmo arquivo,
  #    e o gerador só reprocessa quando algo muda.
  Validar $v.nome '^[\w\.\[\]]+$' 'Nome de view'
  $destino = Caminho $v.arquivo
  $n = Extrair $con "SELECT * FROM $($v.nome) ORDER BY 1, 2, 3, 4, 5, 6, 7" @{} $destino
  Log "view $($v.nome) extraída: $n linhas -> $(Split-Path -Leaf $destino)"

  # 2) Solicitações abertas — opcional; uma falha aqui não impede a atualização dos pagamentos.
  $s = $cfg.solicitacoes
  if ($null -ne $s) {
    try {
      Validar $s.nome '^[\w\.\[\]]+$' 'Nome de view'
      foreach ($c in $s.colunas) { Validar $c '^[\w /]+$' 'Nome de coluna' }
      $colunas = ($s.colunas | ForEach-Object { "[$_]" }) -join ', '
      $parametros = @{}
      $marcas = @()
      for ($i = 0; $i -lt $s.origens.Count; $i++) { $parametros["@o$i"] = [string]$s.origens[$i]; $marcas += "@o$i" }
      $sql = "SELECT $colunas FROM $($s.nome) WHERE [ORIGEM] IN ($($marcas -join ', ')) ORDER BY [PROTOCOLO], [FORNEC_BENEFICIARIO], [DESCRI], [VALOR]"
      $destinoSol = Caminho $s.arquivo
      $n = Extrair $con $sql $parametros $destinoSol
      Log "view $($s.nome) extraída: $n itens ($($s.origens -join ', ')) -> $(Split-Path -Leaf $destinoSol)"
    } catch {
      Log "AVISO: não foi possível extrair as solicitações: $($_.Exception.Message)"
    }
  }

  # 3) Contratos dos fornecedores — opcional, como as solicitações.
  $c = $cfg.contratos
  if ($null -ne $c) {
    try {
      Validar $c.nome '^[\w\.\[\]]+$' 'Nome de view'
      $destinoCt = Caminho $c.arquivo
      $n = Extrair $con "SELECT * FROM $($c.nome) ORDER BY [CONTRATO], [COD. PRODUTO], [COD. CENTRO CUSTO]" @{} $destinoCt
      Log "view $($c.nome) extraída: $n linhas -> $(Split-Path -Leaf $destinoCt)"
    } catch {
      Log "AVISO: não foi possível extrair os contratos: $($_.Exception.Message)"
    }
  }

  # 4) Ordens de Fornecimento abertas — opcional; só as colunas configuradas (sem CPF nem dados bancários).
  $o = $cfg.ofs
  if ($null -ne $o) {
    try {
      Validar $o.nome '^[\w\.\[\]]+$' 'Nome de view'
      foreach ($col in $o.colunas) { Validar $col '^[\w /]+$' 'Nome de coluna' }
      $colunasOf = ($o.colunas | ForEach-Object { "[$_]" }) -join ', '
      $destinoOf = Caminho $o.arquivo
      $n = Extrair $con "SELECT $colunasOf FROM $($o.nome) ORDER BY [PEDIDO/OF], [DESCRI], [VALOR TOTAL]" @{} $destinoOf
      Log "view $($o.nome) extraída: $n itens de OF -> $(Split-Path -Leaf $destinoOf)"
    } catch {
      Log "AVISO: não foi possível extrair as ordens de fornecimento: $($_.Exception.Message)"
    }
  }
} catch {
  Log "ERRO ao extrair a view: $($_.Exception.Message)"
  exit 1
} finally {
  $con.Close()
}
