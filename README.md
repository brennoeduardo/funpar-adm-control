# FUNPAR ADM Control

Painel interno, só de consulta, de fornecedores, contratos e pagamentos administrativos da FUNPAR.
Os dados vêm dos relatórios do Protheus (FINA750) e do `cadastros.xlsx`. Não há banco de dados, servidor web nem login.

Arquitetura: painel em HTML único + gerador agendado que lê as views do Protheus (SQL Server) e grava `dados.js` na pasta compartilhada.

## Estrutura

```
src/core/          núcleo em TypeScript, usado pelo navegador e pelo Node
  relatorios.ts    leitura do FINA750 (Excel/CSV), chave do título, mescla sem duplicar
  cadastros.ts     leitura e validação (Zod) do cadastros.xlsx
  conciliacao.ts   escopo, competência e vínculo título → contrato
  situacao.ts      cobertura, situação por competência, vigência, matriz
src/               interface Vue 3 (painel, visão mensal, pagamentos, fornecedores, contratos, importações)
scripts/
  gerador.ts       lê a pasta de relatórios + cadastros e grava dados.js/dados.json (Agendador de Tarefas)
  migrar-base.ts   gera o cadastros.xlsx a partir da planilha FORNECEDORES CONTRATOS 2026.xlsm
  publicar.ts      copia o HTML e o gerador para a pasta compartilhada
tests/             testes do núcleo (Vitest)
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm install` | instala as dependências |
| `npm run gerar:dev` | gera `public/dados/gerado/dados.js` a partir de `dev/` (cadastros + relatórios de exemplo) |
| `npm run dev` | interface em http://localhost:5173 com os dados de `public/` |
| `npm test` | testes do núcleo |
| `npm run build` | `dist/index.html` (arquivo único) + `dist/gerador.mjs` |
| `npm run publicar -- --destino "<pasta>"` | publica na pasta compartilhada sem sobrescrever cadastros, config nem dados |
| `npm run migrar -- --planilha "<xlsm>" --saida "<cadastros.xlsx>" [--fina "<fina750.xlsx>"] [--forcar]` | migração inicial dos cadastros |

`dev/` e `public/dados/` contêm dados reais e ficam fora do controle de versão (`.gitignore`), assim como planilhas, CSVs e logs.

### Configuração da rede interna

Servidor, banco e nomes das views **não ficam no repositório**. Antes de publicar, copie o modelo e preencha:

```
copy publicar.config.example.json publicar.config.json
```

A conexão com o SQL Server usa o login do Windows de quem executa (Integrated Security); nenhuma senha é guardada.

## Regras principais

- **Chave do título:** Filial + Prefixo + Nº + Parcela + Tipo + Fornecedor + Loja. Se o mesmo título vier em vários relatórios, vale a versão do relatório gerado por último.
- **Escopo:** só entram fornecedores do cadastro (código + loja; loja em branco aceita qualquer loja). Os demais títulos aparecem apenas como contagem.
- **Competência:** mês da emissão, com correção possível na aba Ajustes.
- **Vínculo com o contrato:**
  1. Aba Ajustes.
  2. Único contrato vigente do fornecedor.
  3. Valor mais próximo da referência, dentro da tolerância, com no máximo um título por contrato por competência.
  4. Se nada disso resolver, o título fica "sem vínculo".
- **Situação:** "Sem registro" só aparece quando os relatórios cobrem o mês inteiro. Um relatório só de baixados **nunca** gera "pendente" nem "vencido": esses estados exigem um relatório de títulos em aberto (saldo > 0).
- **Arquivos ilegíveis ou alterados há menos de 60 s** não são registrados como importados e são tentados de novo na execução seguinte.
