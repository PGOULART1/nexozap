# NexoZap: guia completo de instalação, Zabbix e produção

Documentação consolidada em 09/09/2026. Destino: Linux com systemd e Zabbix 7.0.30. O procedimento pressupõe Zabbix Server e NexoZap no mesmo servidor, sem containers separados. A interface web do Zabbix pode ser acessada por HTTPS.

## Índice

1. [Funcionamento e requisitos](#1-funcionamento-e-requisitos)
2. [Instalação Linux](#2-instalação-linux)
3. [Configuração e credenciais](#3-configuração-e-credenciais)
4. [Login e grupo WhatsApp](#4-login-e-grupo-whatsapp)
5. [Serviço systemd](#5-serviço-systemd)
6. [Webhook Zabbix](#6-webhook-zabbix)
7. [Modelos de mensagem](#7-modelos-de-mensagem)
8. [Testes e ações automáticas](#8-testes-e-ações-automáticas)
9. [Troca para produção](#9-troca-para-produção)
10. [Atualizações e manutenção](#10-atualizações-e-manutenção)
11. [Diagnóstico](#11-diagnóstico)
12. [Limites e referências](#12-limites-e-referências)

## 1. Funcionamento e requisitos

O Zabbix envia assunto, mensagem e ID do item ao NexoZap por HTTP autenticado. O NexoZap busca no frontend o gráfico da última hora e envia uma foto cuja legenda contém o assunto e o corpo do alerta. Se não conseguir obter o gráfico, envia apenas o texto.

| Componente | Local/função |
| --- | --- |
| Código | /opt/nexozap |
| Configuração privada | /opt/nexozap/.env |
| Credenciais WhatsApp | /var/lib/nexozap/session |
| Serviço contínuo | nexozap-api |
| API local | http://127.0.0.1:3000 |
| Frontend Zabbix | HTTPS, login local de usuário com leitura |
| Grupo de destino | ALERT_GROUP_ID no .env |

Requisitos: sudo para instalar, Git, npm, OpenSSL, Node.js compatível com o projeto (mínimo 20.9; use Node 24 LTS para nova instalação), conta WhatsApp com permissão de envio no grupo e usuário Zabbix que visualize os itens/gráficos.

Instale o Node por um método de sistema adequado à distribuição, seguindo a [página oficial de instalação](https://nodejs.org/en/download). Não dependa de um Node dentro da pasta pessoal de outro usuário: o serviço usa ProtectHome=true. A instalação do Node é um pré-requisito; a escolha do pacote depende da distribuição e arquitetura.

Comandos Linux deste guia usam Bash. Comandos marcados PowerShell são executados no computador Windows. Substitua os placeholders pelos valores da instalação; nunca cole URLs no formato Markdown [endereço](endereço) dentro de .env ou comandos.

## 2. Instalação Linux

### 2.1 Pacotes e Node

Para Debian/Ubuntu:

```bash
sudo apt update
sudo apt install -y git openssl nano ca-certificates
node --version
npm --version
command -v node
```

Se Node/npm não existirem ou forem incompatíveis, instale a versão compatível antes de continuar. Anote o caminho absoluto retornado. Nos exemplos a seguir, o Node correto é /usr/local/bin/node; se o seu estiver em /usr/bin/node, substitua os caminhos.

### 2.2 Usuário e diretórios

Confira se o usuário existe:

```bash
id nexozap
```

Somente se não existir:

```bash
sudo useradd --system --create-home --home-dir /var/lib/nexozap --shell /usr/sbin/nologin nexozap
```

Prepare os diretórios:

```bash
sudo install -d -o nexozap -g nexozap -m 755 /opt/nexozap
sudo install -d -o nexozap -g nexozap -m 700 /var/lib/nexozap/session
ls -la /opt/nexozap
```

### 2.3 Clonar e instalar

Com a pasta /opt/nexozap vazia:

```bash
sudo -u nexozap git clone https://github.com/PGOULART1/nexozap.git /opt/nexozap
cd /opt/nexozap
ls -l package.json src/server.js src/groups.js src/zabbix-graphs.js
sudo -u nexozap /usr/local/bin/node --version
sudo -u nexozap npm install --omit=dev
```

Se a pasta já contiver .git, use o procedimento de atualização. Se contiver outros arquivos, confira e preserve-os antes de clonar; não apague a pasta inteira. package.json e src precisam estar diretamente na raiz, sem subpasta nexozap-zabbix-update.

sharp é usado para miniaturas das imagens. Não omita dependências opcionais na instalação, pois seus binários são específicos de plataforma. Não copie node_modules do Windows para Linux. Se houver package-lock.json versionado e consistente, npm ci --omit=dev pode ser usado para instalação reproduzível; se npm install alterar o lockfile, revise e versiona-o pelo fluxo normal, sem descartar alterações cegamente.

Não avance se a instalação falhar.

## 3. Configuração e credenciais

### 3.1 Usuário para gráficos

No Zabbix, crie um usuário comum dedicado, por exemplo nexozap-graficos, em grupo com acesso de leitura aos grupos de hosts desejados. Ele precisa de acesso ao frontend e aos gráficos. Teste em janela anônima: faça login e abra o gráfico de um item monitorado.

Não é necessário ser administrador. A implementação usa login local sem MFA; se a política exigir MFA/SSO, será necessário adaptar a autenticação, não desativar a política indiscriminadamente. O usuário de gráficos e o usuário destinatário de notificações podem ser diferentes.

### 3.2 Arquivo .env

Crie o arquivo somente se não existir:

```bash
cd /opt/nexozap
if [ ! -e .env ]; then
  sudo -u nexozap cp .env.example .env
fi
sudo chmod 600 .env
openssl rand -hex 32
sudo -u nexozap nano .env
```

Guarde o token gerado e use-o como API_TOKEN. Exemplo completo (substitua valores fictícios):

```ini
APP_NAME=NexoZap
SESSION_DIR=/var/lib/nexozap/session
LOG_LEVEL=info
LOG_PRETTY=false
CONNECT_TIMEOUT_MS=120000
RECONNECT_INITIAL_DELAY_MS=2000
RECONNECT_MAX_DELAY_MS=30000
MAX_FILE_SIZE_MB=50

API_PORT=3000
API_TOKEN=COLE_O_TOKEN_GERADO
ALERT_GROUP_ID=COLE_O_ID_COMPLETO_DO_GRUPO

ZABBIX_GRAPHS_ENABLED=true
ZABBIX_URL=https://zabbix.example.com/
ZABBIX_USERNAME=nexozap-graficos
ZABBIX_PASSWORD='COLE_A_SENHA_DO_USUARIO'
```

O grupo será obtido na próxima etapa. A URL é a raiz do frontend, com eventual subdiretório /zabbix/, sem index.php. Use o nome real do usuário criado. Aspas na senha preservam caracteres como # e espaços; escolha a forma de citação compatível com os caracteres da sua senha e com dotenv. Não deixe duas definições da mesma variável.

**O nome correto é ZABBIX_GRAPHS_ENABLED, com D no final.** ZABBIX_GRAPHS_ENABLE não é lido e deixa os gráficos desativados.

.env.example é público e contém somente exemplos. .env, senha, token, QR e arquivos da sessão são privados. O token precisa ter ao menos 32 caracteres. Não cole credenciais em prints ou issues.

## 4. Login e grupo WhatsApp

Se estiver instalada a unidade antiga nexozap, desative-a antes de usar a API:

```bash
sudo systemctl disable --now nexozap
```

Se ela não existir, prossiga. Se nexozap-api já estiver ativa, pare-a também antes de executar login ou listagem de grupos. Nunca abra dois processos com a mesma sessão.

```bash
cd /opt/nexozap
sudo -u nexozap /usr/local/bin/node src/cli.js login
```

No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho. Escaneie o QR, aguarde “WhatsApp conectado” e encerre com Ctrl+C. Isso preserva a sessão.

Liste os grupos:

```bash
sudo -u nexozap /usr/local/bin/node src/groups.js
```

Copie o ID completo terminado em @g.us do grupo correto. Nomes podem se repetir; confirme o destino. O celular conectado precisa participar do grupo e ter permissão de envio.

```bash
sudo -u nexozap nano /opt/nexozap/.env
```

Preencha ALERT_GROUP_ID com o ID obtido, incluindo @g.us. Não use o nome do grupo nessa variável.

## 5. Serviço systemd

Copie a unidade:

```bash
sudo cp /opt/nexozap/deploy/nexozap-api.service /etc/systemd/system/
sudo systemctl daemon-reload
```

A unidade original usa /usr/bin/node. Se o Node correto estiver em /usr/local/bin/node:

```bash
sudo systemctl edit nexozap-api
```

No editor, as três linhas devem ficar **acima** do comentário de descarte:

```ini
### Editing /etc/systemd/system/nexozap-api.service.d/override.conf
### Anything between here and the comment below will become the contents of the drop-in file

[Service]
ExecStart=
ExecStart=/usr/local/bin/node /opt/nexozap/src/server.js

### Edits below this comment will be discarded
```

ExecStart= vazio remove o comando anterior. No nano, salve com Ctrl+O, Enter e saia com Ctrl+X. Não coloque as linhas abaixo do aviso: serão descartadas.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nexozap-api
sudo systemctl cat nexozap-api
sudo journalctl -u nexozap-api -f
```

Confirme “API NexoZap disponível em localhost” e “WhatsApp conectado”. Ctrl+C encerra apenas a visualização dos logs. Iniciar a API não testa o login no frontend Zabbix: esse login acontece quando chega um alerta com item válido.

## 6. Webhook Zabbix

Vá em Alertas → Tipos de mídia → Criar tipo de mídia. Nome: NexoZap. Tipo: Webhook. Tempo limite: 60s.

| Parâmetro | Valor permanente |
| --- | --- |
| URL | http://127.0.0.1:3000/alerts |
| Token | Mesmo API_TOKEN do .env |
| Subject | {ALERT.SUBJECT} |
| Message | {ALERT.MESSAGE} |
| ItemId | {ITEM.ID1} |

Respeite maiúsculas/minúsculas em ItemId. HTTPProxy pode ficar vazio; To não é utilizado pelo script. A API usa exclusivamente o grupo do .env.

No campo Script, cole **o conteúdo** do [arquivo do webhook](../deploy/zabbix-webhook.js). Não escreva apenas deploy/zabbix-webhook.js no campo. Para consultar pelo Linux:

```bash
cat /opt/nexozap/deploy/zabbix-webhook.js
```

Desmarque Processar tags e Incluir entrada no menu do evento. Em opções, use uma sessão simultânea, 3 tentativas e intervalo de 30s. O token aparece na configuração do tipo de mídia: restrinja acesso e não publique exportação contendo seu valor.

## 7. Modelos de mensagem

Em Alertas → Tipos de mídia → NexoZap → Modelos de mensagem, configure os dois tipos abaixo. O webhook une assunto e mensagem; esse conteúdo inteiro é a legenda da imagem.

### Problema

Assunto:

```text
🔴 INCIDENTE DETECTADO | {HOST.NAME}
```

Mensagem:

```text
{EVENT.NAME}

🕒 Início: {EVENT.TIME} de {EVENT.DATE}
⚠️ Severidade: {EVENT.SEVERITY}

🖥️ Host: {HOST.NAME}
🌐 IP: {HOST.IP}

📊 Item: {ITEM.NAME1}
• Valor no incidente: {ITEM.VALUE1}
• Último valor: {ITEM.LASTVALUE1}

🔎 Evento: {EVENT.ID} | Item: {ITEM.ID1}
```

### Recuperação de problema

Assunto:

```text
✅ INCIDENTE RESOLVIDO | {HOST.NAME}
```

Mensagem:

```text
{EVENT.NAME}

🕒 Resolvido em: {EVENT.RECOVERY.TIME} de {EVENT.RECOVERY.DATE}
⏱️ Duração: {EVENT.DURATION}

🖥️ Host: {HOST.NAME}
🌐 IP: {HOST.IP}
⚠️ Severidade do incidente: {EVENT.SEVERITY}

📊 Item: {ITEM.NAME1}
• Valor no incidente: {ITEM.VALUE1}
• Último valor: {ITEM.LASTVALUE1}

🔎 Evento: {EVENT.ID} | Item: {ITEM.ID1}
```

ITEM.LASTVALUE1 representa o último valor disponível ao processar a notificação, não necessariamente a amostra exata de recuperação. ITEM.VALUE1 é um valor histórico associado ao contexto do evento; valide a interpretação do campo no fluxo de recuperação usado. Mapeamento de valores do item determina descrições como established (6). O índice 1 corresponde ao primeiro item da expressão, também usado para o gráfico. Não fixe valores de status, IP ou item de um exemplo no modelo genérico.

## 8. Testes e ações automáticas

### 8.1 Encontrar um ItemId válido

Monitoramento → Dados recentes → filtre pelo host → Aplicar. Na linha de um item numérico com dados, clique em Gráfico. Copie a URL do gráfico, por exemplo:

```text
history.php?action=showgraph&itemids%5B%5D=123456
```

Neste exemplo o ID é 123456; use o real da instalação. O usuário de gráficos precisa conseguir visualizar esse item. Não confunda filter_hostids com itemid. Na configuração de itens do Zabbix 7, clicar no nome pode abrir um popup cujo link é javascript:void(0); use o caminho por Dados recentes.

### 8.2 Teste manual

Na lista de tipos de mídia, clique em Testar no NexoZap. Somente na janela de teste:

- Subject: Teste NexoZap.
- Message: Validando imagem e legenda.
- ItemId: ID numérico real encontrado acima.
- Token: token correto; preserve URL.

O teste envia uma mensagem real ao grupo. O esperado é uma foto com assunto e mensagem na legenda. Deixar as macros literais pode gerar texto literal ou ignorar a imagem. Na configuração permanente, mantenha as macros.

### 8.3 Usuário que recebe notificações

Em Usuários → Usuários, escolha um usuário dedicado com leitura nos hosts. Em Mídia → Adicionar:

| Campo | Valor |
| --- | --- |
| Tipo | NexoZap |
| Enviar para | Rótulo do grupo de alertas |
| Quando ativo | 1-7,00:00-24:00 |
| Severidades | As que deseja receber |
| Habilitado | Marcado |

Enviar para é um rótulo nesta integração; o destino efetivo é ALERT_GROUP_ID. Alterar apenas esse campo do usuário não muda o grupo WhatsApp.

### 8.4 Ação de incidentes

Alertas → Ações → Ações de trigger → Criar ação:

1. Nome: Enviar incidentes para WhatsApp.
2. Comece com condição restrita a um host de teste e ação habilitada.
3. Em Operações, adicione Enviar mensagem para o usuário dedicado, somente pela mídia NexoZap, etapas 1 até 1.
4. Use a mensagem padrão. Mensagem personalizada na ação pode sobrescrever o modelo do tipo de mídia.
5. Em Operações de recuperação, adicione envio para o mesmo usuário/mídia, também com mensagem padrão.
6. Salve; provoque um incidente controlado e normalize a condição.

Confirme problema e recuperação no grupo. Criar uma ação não envia automaticamente todos os incidentes já abertos. Consulte Relatórios → Log de ações em caso de falha. Amplie as condições somente após a validação.

## 9. Troca para produção

### 9.1 Trocar somente o grupo

Se o celular conectado já é o correto e participa do novo grupo: pare a API, execute src/groups.js, copie o ID e edite ALERT_GROUP_ID no .env. Encerre o comando de listagem antes de reiniciar a API. Faça teste controlado. Todos os alertas dessa instância passam ao novo grupo; não há roteamento por usuário ou host no MVP.

### 9.2 Trocar o celular conectado

Reserve uma janela de manutenção: durante a troca os envios ficam indisponíveis. Confirme o caminho de SESSION_DIR antes de usar os comandos abaixo; eles pressupõem /var/lib/nexozap/session.

```bash
sudo systemctl stop nexozap-api
sudo install -d -o nexozap -g nexozap -m 700 /var/lib/nexozap/backups
```

Guarde a sessão de teste em uma pasta de backup exclusiva (anote o caminho exibido):

```bash
backup_dir=$(sudo -u nexozap mktemp -d /var/lib/nexozap/backups/troca-XXXXXXXX)
if [ -z "$backup_dir" ] || [ ! -d "$backup_dir" ]; then
  echo "Falha ao criar backup; não prossiga."
else
  sudo mv -- /var/lib/nexozap/session "$backup_dir/session"
  printf 'Backup da sessão: %s/session\n' "$backup_dir"
fi
```

Só continue se o movimento tiver concluído sem erro. O backup contém chaves privadas e deve continuar protegido. Crie a nova pasta e faça login:

```bash
sudo install -d -o nexozap -g nexozap -m 700 /var/lib/nexozap/session
cd /opt/nexozap
sudo -u nexozap /usr/local/bin/node src/cli.js login
```

Escaneie com o celular de produção, aguarde conexão e encerre com Ctrl+C. Liste os grupos e edite o destino:

```bash
sudo -u nexozap /usr/local/bin/node src/groups.js
sudo -u nexozap nano /opt/nexozap/.env
```

Atualize ALERT_GROUP_ID para o grupo acessível pelo novo celular. Não reinicie com o ID de teste sem conferir.

```bash
sudo systemctl restart nexozap-api
sudo journalctl -u nexozap-api -f
```

Confirme login, mensagem de teste, gráfico com legenda e um incidente/recuperação controlados. A troca não exige mudar API_TOKEN ou a senha de gráficos.

Mover a sessão não desvincula automaticamente o aparelho de teste no WhatsApp. Após validar a migração e decidir que não precisa retornar, remova a conexão antiga no celular de teste em Aparelhos conectados. Isso invalida a reutilização daquela sessão de backup.

### 9.3 Retorno à sessão anterior

Pare nexozap-api. Preserve a sessão de produção numa pasta protegida separada antes de restaurar a sessão anterior. Restaure o backup anotado para /var/lib/nexozap/session, confira proprietário nexozap e permissões, restaure o ID do grupo anterior e reinicie. Não misture arquivos de sessões diferentes. Se a conta tiver revogado a conexão, será necessário novo QR.

## 10. Atualizações e manutenção

### Windows e GitHub

Antes de copiar uma atualização, confira git status. Se a árvore estiver limpa:

```powershell
git pull --ff-only
```

Copie o conteúdo do pacote para a raiz, não uma subpasta extra. Revise git diff e adicione apenas os arquivos desejados. Para este pacote de documentação:

```powershell
git add README.md docs/INSTALACAO.md deploy/zabbix-webhook.js
git commit -m "Documenta instalação completa e operação em produção"
git push origin main
```

Se push for rejeitado porque o remoto avançou, com mudanças locais já commitadas use git pull --rebase origin main. Se houver conflito, resolva somente os arquivos indicados, git add nesses arquivos e git rebase --continue. Não tente criar outro commit enquanto o rebase estiver pendente. Se git status disser all conflicts fixed, conclua com git rebase --continue. Confira o resultado antes de push; não use force para substituir o trabalho remoto.

### Servidor

Para documentação apenas, basta git pull --ff-only; não há motivo para reiniciar. Para código, reserve manutenção e confira git status antes de atualizar. Não descarte mudanças locais de configuração ou lockfile.

```bash
cd /opt/nexozap
sudo -u nexozap git status --short
sudo systemctl stop nexozap-api
sudo -u nexozap git pull --ff-only
```

Se o pull falhar, resolva antes de continuar. Se dependências mudaram, execute npm install --omit=dev como nexozap; se falhar, interrompa a atualização. Depois:

```bash
sudo systemctl restart nexozap-api
sudo journalctl -u nexozap-api -n 30 --no-pager
```

O .env ignorado pelo Git e a sessão fora do projeto permanecem. O override em /etc/systemd/system não é substituído pelo Git. Alterações no .env exigem reinício. Para unidades systemd alteradas, revise/copie a unidade e execute daemon-reload antes do restart.

## 11. Diagnóstico

```bash
sudo systemctl status nexozap-api --no-pager
sudo systemctl cat nexozap-api
sudo journalctl -u nexozap-api --since "10 minutes ago" --no-pager
```

Para gráficos, faça o teste antes de consultar o intervalo:

```bash
sudo journalctl -u nexozap-api --since "5 minutes ago" --no-pager | grep -Ei 'gráfico|graficos|imagem|erro|error|warn'
sudo grep -E '^(ZABBIX_GRAPHS_ENABLED|ZABBIX_URL|ZABBIX_USERNAME)=' /opt/nexozap/.env
```

Não publique o .env inteiro. Logs Baileys podem conter telefones e outros identificadores; revise antes de compartilhar.

| Sintoma | O que verificar |
| --- | --- |
| package.json não encontrado | Clone ausente ou arquivo um nível abaixo da raiz. |
| Clone: pasta não vazia | Inspecione e preserve o conteúdo; use pull se já for clone. |
| src/groups.js não encontrado com Git atualizado | Atualização pode estar dentro de nexozap-zabbix-update. Corrija estrutura no Windows e publique. |
| Aviso cp -n | Não é falha de instalação; use o teste de existência deste guia. |
| globalThis.crypto undefined, Node 18 nos logs | systemd usa Node antigo. Corrija ExecStart para o binário validado. |
| Override sem efeito | Linhas abaixo do comentário de descarte não são salvas. Confira systemctl cat. |
| Texto com macros literais | No teste manual substitua macros por valores reais; mantenha-as na configuração permanente. |
| Só texto, nenhum aviso de gráfico | Confira ZABBIX_GRAPHS_ENABLED=true, com D final, reinício após edição, ItemId exato e ID numérico. |
| Só texto com aviso de gráfico | Confira login, permissão de leitura, URL HTTPS, histórico numérico e acesso de rede ao frontend. |
| HTTP 401 | Token ausente ou diferente do API_TOKEN. |
| HTTP 400 | Corpo inválido/texto vazio ou maior que 8000 caracteres. |
| HTTP 503 | WhatsApp desconectado ou outro envio em andamento. |
| HTTP 502/timeout | Falha de envio com resultado potencialmente incerto; verifique o grupo antes de repetir. |
| Connection refused | Serviço/porta incorretos ou Zabbix Server em outro ambiente de rede. |
| Teste manual chega, incidente não | Revise filtros da ação, mídia, período, severidades, permissões e Log de ações. |
| Modelo antigo chega | Ação pode estar com mensagem personalizada sobrescrevendo o padrão. |

### Teste direto da API, sem exibir segredos

Este teste envia uma mensagem real ao grupo atual. Substitua ITEM_ID_REAL por um ID numérico válido e ajuste o caminho do Node se necessário:

```bash
cd /opt/nexozap
sudo -u nexozap /usr/local/bin/node --input-type=module <<'JS'
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
console.log({
  graficosHabilitados: process.env.ZABBIX_GRAPHS_ENABLED === 'true',
  usuarioConfigurado: Boolean(process.env.ZABBIX_USERNAME),
  senhaConfigurada: Boolean(process.env.ZABBIX_PASSWORD)
});
const response = await fetch('http://127.0.0.1:3000/alerts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.API_TOKEN}`
  },
  body: JSON.stringify({ text: 'Teste direto NexoZap', itemId: 'ITEM_ID_REAL' }),
  signal: AbortSignal.timeout(65000)
});
console.log('HTTP:', response.status);
console.log('Resposta:', await response.text());
JS
```

graphStatus=sent: chamada de envio da imagem concluiu; failed: obtenção falhou e texto foi enviado; skipped: gráfico não solicitado ou provedor desativado. HTTP 502 pode indicar falha da foto, sem envio automático de um segundo texto. O teste lê o .env atual; o serviço só adota alterações após reiniciar.

## 12. Limites e referências

- Gráfico simples do primeiro item da trigger, última hora relativa ao momento de envio, PNG até 5 MiB. Não captura dashboard nem reúne todos os itens da expressão.
- Busca de gráfico com orçamento de 8 segundos. Falha coloca a busca em pausa por 5 minutos; reiniciar limpa essa pausa após corrigir a configuração.
- HTTPS validado; sessão do frontend apenas em memória. Não desative TLS para contornar certificados incorretos.
- Foto e legenda usam uma tentativa de envio. Falha ao obter gráfico gera fallback de texto. Falha ao enviar foto retorna erro sem tentar texto adicional automaticamente.
- HTTP 200 não confirma leitura nem entrega no celular. Não há fila persistente, deduplicação ou garantia de exatamente uma entrega. Tentativas do Zabbix após timeout podem duplicar alertas.
- Um único processo por sessão, uma única conta/grupo por instância. A API fica em localhost e não aceita destino arbitrário do webhook.
- Baileys é não oficial; para operação crítica, mantenha também um canal independente de notificação.

Na instalação acompanhada foram confirmados login, alertas de problema/recuperação, gráfico e mensagem única. A migração para a conta de produção deve passar por uma nova validação; este guia não presume que ela foi concluída.

Referências:

- [Zabbix 7.0 — webhook](https://www.zabbix.com/documentation/7.0/en/manual/config/notifications/media/webhook)
- [Zabbix — macros](https://www.zabbix.com/documentation/7.0/en/manual/appendix/macros/supported_by_location)
- [Zabbix — gráfico simples](https://www.zabbix.com/documentation/7.0/en/manual/config/visualization/graphs/simple)
- [Frontend chart.php 7.0.30](https://github.com/zabbix/zabbix/blob/7.0.30/ui/chart.php)
- [Node.js — instalação](https://nodejs.org/en/download)
- [sharp — instalação](https://sharp.pixelplumbing.com/install/)
