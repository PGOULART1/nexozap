# Zabbix 7.0.30 → Alertas teste

Este procedimento pressupõe Zabbix Server e NexoZap no mesmo Linux, fora de containers separados. A API escuta exclusivamente em 127.0.0.1. Caso sejam máquinas ou containers diferentes, ajuste a arquitetura de rede antes de configurar o webhook.

## Atualizar o código

Copie os arquivos atualizados para seu checkout Windows, faça commit e push. Depois no Linux:

```bash
cd /opt/nexozap
sudo -u nexozap git pull --ff-only
```

Não substitua o `.env` existente. Encerre o login manual com Ctrl+C. Se ativou o serviço antigo, pare e desabilite antes de iniciar a API:

```bash
sudo systemctl disable --now nexozap
```

Se essa unidade não existir, prossiga. Nunca execute login, groups, comandos de envio e API simultaneamente com a mesma sessão.

## Identificar o grupo

```bash
cd /opt/nexozap
sudo -u nexozap node src/groups.js
```

Localize `Alertas teste` na tabela e copie o ID terminado em `@g.us`. Se houver nomes repetidos, confirme o grupo antes de enviar; o nome sozinho não é identificador único.

Gere um token no servidor:

```bash
openssl rand -hex 32
sudo -u nexozap nano /opt/nexozap/.env
```

Acrescente ao `.env` (substitua os exemplos):

```ini
API_PORT=3000
API_TOKEN=COLE_O_TOKEN_GERADO
ALERT_GROUP_ID=COLE_O_ID_DO_GRUPO
```

Confira `command -v node` e ajuste `/usr/bin/node` no serviço se necessário. Ative a API:

```bash
sudo cp /opt/nexozap/deploy/nexozap-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nexozap-api
sudo journalctl -u nexozap-api -f
```

Aguarde `WhatsApp conectado`. Ctrl+C sai da visualização dos logs sem parar o serviço.

## Tipo de mídia

No Zabbix: Alertas → Tipos de mídia → Criar tipo de mídia. Nome: NexoZap; tipo: Webhook; timeout: 30s. Configure estes parâmetros, respeitando as maiúsculas:

| Nome | Valor |
| --- | --- |
| URL | http://127.0.0.1:3000/alerts |
| Token | Mesmo API_TOKEN do servidor |
| Subject | {ALERT.SUBJECT} |
| Message | {ALERT.MESSAGE} |

Cole o conteúdo de `deploy/zabbix-webhook.js` no campo Script. Desative processamento de tags e menu do evento. Em opções, use uma sessão simultânea, 3 tentativas e intervalo de 30s. O token é uma credencial: restrinja acesso administrativo ao tipo de mídia e não publique sua exportação com o token preenchido.

Em Modelos de mensagem, adicione os tipos Problema e Recuperação de problema. Exemplos:

Problema — assunto: `PROBLEMA: {EVENT.NAME}`

```text
Host: {HOST.NAME}
Severidade: {EVENT.SEVERITY}
Início: {EVENT.DATE} {EVENT.TIME}
Evento: {EVENT.ID}
```

Recuperação — assunto: `RESOLVIDO: {EVENT.NAME}`

```text
Host: {HOST.NAME}
Recuperado: {EVENT.RECOVERY.DATE} {EVENT.RECOVERY.TIME}
Duração: {EVENT.DURATION}
Evento: {EVENT.ID}
```

Salve e use Testar: preencha Subject com `Teste NexoZap` e Message com `Integração Zabbix 7.0.30`. Esse teste envia uma mensagem real ao grupo configurado.

## Usuário e ação

Em Usuários → Usuários, escolha um usuário dedicado com leitura nos grupos de hosts monitorados. Adicione mídia NexoZap, Enviar para: `Alertas teste` (rótulo; o ID real fica no servidor), período `1-7,00:00-24:00`, severidades desejadas e habilitado.

Em Alertas → Ações → Ações de trigger, crie uma ação habilitada, inicialmente limitada a um host de teste. Adicione operação Enviar mensagem para o usuário dedicado, somente pela mídia NexoZap, etapa 1–1 e mensagem padrão. Em Operações de recuperação, adicione envio ao mesmo usuário/mídia. Teste uma ocorrência e sua recuperação, confirme o recebimento e só então amplie o filtro. Consulte Relatórios → Log de ações para erros de envio.

## Limitações do MVP

O HTTP 200 indica que a chamada ao Baileys concluiu; não confirma leitura nem entrega no celular. Não há fila persistente nem deduplicação. Falhas retornam erro ao Zabbix para permitir suas tentativas; uma falha de resposta após envio pode gerar mensagem duplicada. Envios simultâneos retornam 503. O serviço deve ser o único proprietário da sessão. Esta integração não foi testada com o servidor/WhatsApp real neste workspace.

Referência: https://www.zabbix.com/documentation/7.0/en/manual/config/notifications/media/webhook/webhook_examples
