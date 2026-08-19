# Base de usuário para testes

O arquivo `rv-user-test-portfolio.json` é um backup v5 aceito pela importação normal do Projeta.
Os registros não são carregados pelo código do sistema e, depois da importação, têm o mesmo
comportamento de projetos criados manualmente.

A base cobre quatro cenários siderúrgicos: revamp da absorvedora de NH3, adequação do selo pote
do exaustor principal, implantação de uma planta de tratamento de gás e parada integrada do
sistema de gás da coqueria.

## Importar

1. Abra **Configurações → Dados**.
2. Em **Importar**, selecione `rv-user-test-portfolio.json`.
3. Aguarde a confirmação e volte ao Portfólio.

> A importação substitui todos os projetos, tarefas e anomalias existentes neste navegador.

Para atualizar as datas relativas ao dia atual, execute:

```bash
node scripts/create-user-test-backup.mjs
```
