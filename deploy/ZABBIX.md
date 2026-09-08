# Zabbix 7.0.30 → Alertas teste

Este procedimento pressupõe Zabbix Server e NexoZap no mesmo Linux, fora de containers separados. A API escuta exclusivamente em 127.0.0.1. Caso sejam máquinas ou containers diferentes, ajuste a arquitetura de rede antes de configurar o webhook.

## 1. Preparar o Linux e baixar pelo Git

Os comandos de instalação de pacotes abaixo são para Debian/Ubuntu. Em outras distribuições, use o gerenciador correspondente.

```bash
sudo apt update
sudo apt install -y git openssl nano ca-certificates
node --version
npm --version
command -v node
```

É necessário Node compatível com o projeto. Para novas instalações, use Node 24 LTS, disponível na [página oficial](https://nodejs.org/en/download). Instale-o antes de continuar se não existir. Não confie apenas no Node do terminal: o serviço usa um caminho absoluto, conferido na etapa 5. Neste atendimento o terminal usava /usr/local/bin/node e o serviço usava outro Node, versão 18, em /usr/bin/node.

Crie o usuário apenas se ainda não existir:

```bash
id nexozap
```

Se o comando informar que não existe:

```bash
sudo useradd --system --create-home --home-dir /var/lib/nexozap --shell /usr/sbin/nologin nexozap
```

Prepare os diretórios:

```bash
sudo install -d -o nexozap -g nexozap -m 755 /opt/nexozap
sudo install -d -o nexozap -g nexozap -m 700 /var/lib/nexozap/session
ls -la /opt/nexozap
```

Se /opt/nexozap estiver vazia:

```bash
sudo -u nexozap git clone https://github.com/PGOULART1/nexozap.git /opt/nexozap
```

Se já for um clone, use git pull conforme a seção de atualização. Se contiver outros arquivos, confira antes de mover ou sobrescrever. Não execute clone por cima de uma instalação existente.

Confira a estrutura e instale as dependências:

```bash
cd /opt/nexozap
ls -l package.json src/groups.js src/server.js
sudo -u nexozap npm install --omit=dev
```

O arquivo package.json deve ficar diretamente em /opt/nexozap. src/groups.js deve ficar em /opt/nexozap/src, não dentro de uma subpasta nexozap-zabbix-update.

## 2. Configurar o ambiente

Crie .env apenas se ainda não existir:

```bash
cd /opt/nexozap
if [ ! -e .env ]; then
  sudo -u nexozap cp .env.example .env
fi
sudo chmod 600 .env
sudo -u nexozap nano .env
```

Preserve os valores existentes. Confirme:

```ini
SESSION_DIR=/var/lib/nexozap/session
LOG_LEVEL=info
LOG_PRETTY=false
```

.env.example é um modelo público sem segredos; .env é a configuração privada. A pasta de sessão guarda as credenciais do WhatsApp. Não publique o token, .env, QR Code ou arquivos da sessão no GitHub.

## 3. Primeiro login por QR Code

Encerre qualquer processo anterior com Ctrl+C. Se o serviço antigo estiver instalado, pare-o:

```bash
sudo systemctl disable --now nexozap
```

Se a unidade não existir, prossiga. Se a API já estiver ativa, pare também nexozap-api antes dos comandos manuais. Nunca mantenha dois processos usando a mesma sessão.

```bash
cd /opt/nexozap
sudo -u nexozap node src/cli.js login
```

No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho. Escaneie o QR, aguarde “WhatsApp conectado” e pressione Ctrl+C. A sessão permanece salva.

## 4. Identificar o grupo e gerar o token

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

## 5. Configurar o serviço e o caminho do Node

Copie a unidade antes de habilitá-la:

```bash
sudo cp /opt/nexozap/deploy/nexozap-api.service /etc/systemd/system/
command -v node
sudo -u nexozap node --version
```

Se o Node correto for /usr/bin/node, o comando padrão já serve. Se for /usr/local/bin/node, crie o override:

```bash
sudo systemctl edit nexozap-api
```

No editor, as linhas precisam ficar ACIMA do comentário “Edits below this comment will be discarded”. O início da tela deve ficar assim:

```ini
### Editing /etc/systemd/system/nexozap-api.service.d/override.conf
### Anything between here and the comment below will become the contents of the drop-in file

[Service]
ExecStart=
ExecStart=/usr/local/bin/node /opt/nexozap/src/server.js

### Edits below this comment will be discarded
```

A linha ExecStart= vazia remove o comando anterior. Não coloque as três linhas abaixo do aviso: elas serão descartadas. No nano: Ctrl+O, Enter, Ctrl+X. Se o seu Node estiver em outro caminho, use aquele caminho absoluto. Binários dentro de diretórios pessoais podem ser bloqueados por ProtectHome=true; prefira instalação de sistema.

Ative a API:

```bash
sudo cp /opt/nexozap/deploy/nexozap-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nexozap-api
sudo journalctl -u nexozap-api -f
```

Aguarde `WhatsApp conectado`. Ctrl+C sai da visualização dos logs sem parar o serviço.

## 6. Criar o tipo de mídia no Zabbix

No Zabbix: Alertas → Tipos de mídia → Criar tipo de mídia. Nome: NexoZap; tipo: Webhook; timeout: 30s. Configure estes parâmetros, respeitando as maiúsculas:

| Nome | Valor |
| --- | --- |
| URL | http://127.0.0.1:3000/alerts |
| Token | Mesmo API_TOKEN do servidor |
| Subject | {ALERT.SUBJECT} |
| Message | {ALERT.MESSAGE} |

Cole o conteúdo do [script zabbix-webhook.js](zabbix-webhook.js) no campo Script. O script é executado pelo Zabbix, não por Node no terminal. Desative processamento de tags e menu do evento. Em opções, use uma sessão simultânea, 3 tentativas e intervalo de 30s. O token é uma credencial: restrinja acesso administrativo ao tipo de mídia e não publique sua exportação com o token preenchido.

Script completo para copiar:

```javascript
// Cole este script no tipo de mídia Webhook do Zabbix 7.0.
var params = JSON.parse(value);
var request = new HttpRequest();
request.addHeader('Content-Type: application/json');
request.addHeader('Authorization: Bearer ' + params.Token);
var response = request.post(params.URL, JSON.stringify({
    text: params.Subject + '\n' + params.Message
}));
if (request.getStatus() !== 200) {
    throw 'NexoZap retornou HTTP ' + request.getStatus();
}
return JSON.stringify({tags: {}});
```

## 7. Modelos de problema e recuperação

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

## 8. Teste manual e macros

Salve o tipo de mídia e clique em Testar. Na janela do teste, substitua Subject por `Teste NexoZap` e Message por `Integração Zabbix 7.0.30 funcionando!`. Preserve URL e Token. O teste envia uma mensagem real ao grupo.

Se a mensagem recebida for literalmente:

```text
{ALERT.SUBJECT}
{ALERT.MESSAGE}
```

o transporte funcionou, mas as macros foram passadas como texto no teste manual. Preencha assunto e mensagem reais SOMENTE na janela de teste. Na configuração permanente, mantenha {ALERT.SUBJECT} e {ALERT.MESSAGE}; eles recebem o conteúdo da notificação quando a ação real executa.

O recebimento manual foi confirmado durante a configuração. Isso ainda não comprova as ações automáticas de problema/recuperação.

## 9. Usuário, mídia e ação automática

Em Usuários → Usuários, escolha um usuário dedicado com leitura nos grupos de hosts monitorados. Adicione mídia NexoZap, Enviar para: `Alertas teste` (rótulo; o ID real fica no servidor), período `1-7,00:00-24:00`, severidades desejadas e habilitado.

Em Alertas → Ações → Ações de trigger, crie uma ação habilitada, inicialmente limitada a um host de teste. Adicione operação Enviar mensagem para o usuário dedicado, somente pela mídia NexoZap, etapa 1–1 e mensagem padrão. Em Operações de recuperação, adicione envio ao mesmo usuário/mídia. Teste uma ocorrência e sua recuperação, confirme o recebimento e só então amplie o filtro. Consulte Relatórios → Log de ações para erros de envio.

## 10. Operação, atualizações e diagnóstico

Acompanhar logs e estado:

```bash
sudo systemctl status nexozap-api --no-pager
sudo journalctl -u nexozap-api -n 50 --no-pager
sudo systemctl cat nexozap-api
```

Para atualizar o código já publicado (com árvore Git limpa):

```bash
cd /opt/nexozap
sudo -u nexozap git status --short
sudo -u nexozap git pull --ff-only
```

Se houver alterações locais, revise antes de continuar. Não descarte .env ou sessão. Se a atualização mudar código/dependências, faça em uma janela de manutenção: alertas podem falhar enquanto o serviço estiver parado.

```bash
sudo systemctl stop nexozap-api
sudo -u nexozap npm install --omit=dev
sudo systemctl restart nexozap-api
sudo journalctl -u nexozap-api -n 30 --no-pager
```

Se npm install falhar, resolva o erro antes de reiniciar. Mudanças somente na documentação não precisam de instalação ou reinício. O override do Node em /etc/systemd/system é preservado pelo git pull. Após editar .env, reinicie nexozap-api.

| Sintoma | Verificação e correção |
| --- | --- |
| ENOENT package.json | Confirme /opt/nexozap/package.json e se o clone foi feito na pasta correta. |
| Clone diz pasta não vazia | Inspecione ls -la; preserve arquivos existentes antes de clonar. No caso inicial havia apenas um package-lock.json de instalação malsucedida. |
| groups.js não encontrado, Git atualizado | Verifique se a atualização foi publicada dentro de nexozap-zabbix-update/src. Corrija a estrutura no checkout Windows, faça commit/push e depois pull. |
| Aviso de cp -n | É aviso de portabilidade. Use o teste de existência da etapa 2 para preservar .env. |
| globalThis.crypto undefined, log mostra Node 18 | Corrija ExecStart com o override da etapa 5; confira systemctl cat. |
| Override não surtiu efeito | Confira se as linhas foram salvas acima do comentário de descarte; execute daemon-reload e restart. |
| HTTP 401 | Token do tipo de mídia deve ser idêntico ao API_TOKEN. |
| HTTP 400 | JSON inválido ou text vazio/acima de 8000 caracteres. |
| HTTP 503 | WhatsApp desconectado ou outro envio em andamento. Confira logs e use uma sessão simultânea no Zabbix. |
| HTTP 502 ou timeout | Resultado do envio pode ser incerto; confira o grupo e os logs antes de repetir. |
| Connection refused | Serviço parado, porta incorreta ou Zabbix em outra máquina/container. localhost é o ambiente do Zabbix Server. |
| Macros literais no WhatsApp | Preencha textos reais na janela de teste; mantenha macros na configuração permanente. |
| Teste funciona, alerta real não | Verifique condições da ação, permissões do usuário nos hosts, mídia habilitada, período, severidades e Log de ações. |
| Sessão desconectada pelo celular | Pare a API e refaça o login manual; preserve uma cópia protegida da sessão antes de qualquer substituição. |

Não remova a sessão apenas porque não apareceu QR: com uma sessão válida ele não precisa aparecer.

## 11. Publicar alterações pelo Windows

No PowerShell, dentro da pasta do repositório:

```powershell
git status
git add README.md deploy
git commit -m "Atualiza documentação de instalação e Zabbix"
git pull --rebase origin main
git push origin main
```

Se houver conflito, resolva-o antes do push; não use force para substituir mudanças remotas. Antes de fazer novos commits após alterações pelo site ou por outro colaborador, use git pull --ff-only quando sua árvore estiver limpa.

Se receber um ZIP de atualização, copie seu CONTEÚDO para a raiz do projeto. Não versione uma pasta extra contendo outro src e deploy. Em git status, os arquivos devem aparecer como src/... e deploy/....

## Limitações do MVP

O HTTP 200 indica que a chamada ao Baileys concluiu; não confirma leitura nem entrega no celular. Não há fila persistente nem deduplicação. Falhas retornam erro ao Zabbix para permitir suas tentativas; uma falha de resposta após envio pode gerar mensagem duplicada. Envios simultâneos retornam 503. O serviço deve ser o único proprietário da sessão. O login pelo serviço e o recebimento de uma mensagem pelo webhook foram confirmados pelos logs e captura do operador. A ação automática de problema e recuperação ainda precisa de validação.

Referências: [Webhook no Zabbix 7.0](https://www.zabbix.com/documentation/7.0/en/manual/config/notifications/media/webhook) e [exemplos oficiais](https://www.zabbix.com/documentation/7.0/en/manual/config/notifications/media/webhook/webhook_examples).

