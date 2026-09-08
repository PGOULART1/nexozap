# Gráficos do Zabbix como imagem no WhatsApp

Atualização para Zabbix 7.0.30 com login local no frontend. Primeiro envia o texto; depois tenta enviar como foto o gráfico do primeiro item da trigger, cobrindo a última hora no momento do envio. Não é captura de dashboard nem gráfico composto de todos os itens da trigger.

## 1. Publicar a atualização

No Windows, faça git pull com a árvore limpa antes de copiar a atualização. Extraia o CONTEÚDO do ZIP na raiz do projeto: src, deploy, test, package.json e .env.example. Não crie uma pasta intermediária dentro do repositório.

```powershell
git add src deploy test package.json .env.example
git commit -m "Adiciona gráficos Zabbix como imagem"
git pull --rebase origin main
git push
```

Se houver conflitos, resolva antes de continuar. Nunca publique o .env real.

## 2. Atualizar no Linux

```bash
cd /opt/nexozap
sudo -u nexozap git pull --ff-only
sudo systemctl stop nexozap-api
sudo -u nexozap npm install --omit=dev
```

A instalação inclui sharp, usado pelo Baileys para miniaturas de imagens. Não omita dependências opcionais: os binários específicos de plataforma são necessários. Node mínimo agora é 20.9, recomendado 24 LTS. O override existente de /usr/local/bin/node continua válido. Se a instalação falhar, resolva antes de reiniciar. O serviço estará parado durante a manutenção.

## 3. Credenciais no servidor

O usuário nexozap-graficos precisa entrar no frontend por usuário/senha e visualizar o item com permissão de leitura. Esta implementação não faz MFA, SSO ou desafios CAPTCHA. Use um usuário dedicado conforme as regras de autenticação da sua organização.

```bash
sudo -u nexozap nano /opt/nexozap/.env
```

Adicione ou edite sem duplicar as variáveis:

```ini
ZABBIX_GRAPHS_ENABLED=true
ZABBIX_URL=https://zabbix.gruporktelecom.com.br/
ZABBIX_USERNAME=nexozap-graficos
ZABBIX_PASSWORD='COLE_A_SENHA_REAL_AQUI'
```

Use o usuário que realmente criou, se o nome for diferente. A URL deve apontar à raiz do frontend; inclua /zabbix/ se esse for o subdiretório da sua instalação. Não inclua index.php. Mantenha API_TOKEN, ALERT_GROUP_ID e SESSION_DIR existentes.

Aspas preservam # e espaços na senha no dotenv. Se a senha contiver aspas simples, use aspas duplas adequadas ao dotenv ou uma senha aleatória sem aspas. Não envie nem publique a senha.

```bash
sudo chmod 600 /opt/nexozap/.env
sudo systemctl restart nexozap-api
sudo journalctl -u nexozap-api -n 30 --no-pager
```

O login no frontend para gráficos acontece somente quando chega um alerta com ItemId válido. A inicialização da API sozinha não valida essas credenciais.

## 4. Atualizar o tipo de mídia

No Zabbix, Alertas → Tipos de mídia → NexoZap:

- Substitua o Script pelo conteúdo atualizado de [zabbix-webhook.js](zabbix-webhook.js).
- Preserve URL, Token, Subject e Message.
- Adicione o parâmetro **ItemId** com valor **{ITEM.ID1}**.
- Ajuste Timeout para **60s** e mantenha uma sessão simultânea.
- Salve. Nenhuma senha Zabbix é necessária nesse tipo de mídia.

| Parâmetro | Valor permanente |
| --- | --- |
| URL | http://127.0.0.1:3000/alerts |
| Token | Mesmo API_TOKEN do NexoZap |
| Subject | {ALERT.SUBJECT} |
| Message | {ALERT.MESSAGE} |
| ItemId | {ITEM.ID1} |

O ItemId deve representar um item numérico (por exemplo CPU, tráfego ou disponibilidade) com histórico acessível. Em triggers com vários itens, esta versão usa o primeiro. O período é relativo ao envio, inclusive em recuperações; não é centrado no horário original do evento.

## 5. Testar

Na janela Testar do tipo de mídia, preencha Subject e Message com textos reais. Em ItemId, substitua a macro por um ID numérico real de um item que o usuário consegue visualizar. Você pode identificar itemid na URL ao abrir a configuração do item em Coleta de dados → Hosts → Itens.

O esperado é uma mensagem de texto seguida da imagem. Deixar {ITEM.ID1} literal na janela de teste envia só texto. Nas ações reais, mantenha a macro na configuração permanente.

Antes de ampliar o uso, teste um problema e sua recuperação. O recebimento real da imagem não foi validado no ambiente de desenvolvimento: depende do seu frontend, permissões, dados do item e sessão WhatsApp.

## Falhas e limites

- HTML de login, acesso negado, timeout ou credenciais inválidas não são enviados como imagem. Conteúdo, assinatura PNG, dimensões e tamanho são verificados. Uma imagem de erro gerada pelo próprio Zabbix ainda pode passar pela validação de formato: confira o conteúdo no teste real.
- O download tem orçamento total de 8 segundos e limite de 5 MiB. As credenciais vão apenas ao HTTPS configurado; redirecionamentos não são seguidos.
- A sessão frontend fica em memória. Se expirar, tenta um novo login. Uma falha coloca a busca em pausa por 5 minutos para evitar tentativas contínuas de senha. Depois de corrigir a configuração, reinicie a API para limpar a pausa.
- Se a busca ou envio da imagem falhar após o texto, a API retorna HTTP 200 para não repetir o texto. Os logs informam a falha. O Zabbix pode mostrar sucesso mesmo sem imagem; acompanhe o WhatsApp e journalctl na validação.
- A resposta HTTP contém graphStatus: sent, failed ou skipped. O webhook mantém sua resposta de sucesso compatível com Zabbix; não cria tags extras.
- O serviço permanece ocupado enquanto envia texto e imagem. Sem fila persistente ou deduplicação; timeouts após envio podem gerar duplicatas nas novas tentativas do Zabbix.
- Para desativar somente os gráficos, configure ZABBIX_GRAPHS_ENABLED=false e reinicie nexozap-api.
- Erros HTTPS devem ser resolvidos com certificado/CA corretos. Não desative a validação TLS.

## Referências

- [Frontend de login Zabbix 7.0.30](https://github.com/zabbix/zabbix/blob/7.0.30/ui/index.php)
- [Gráfico simples chart.php](https://github.com/zabbix/zabbix/blob/7.0.30/ui/chart.php)
- [Macros de item](https://www.zabbix.com/documentation/7.0/en/manual/appendix/macros/supported_by_location)
- [Instalação sharp](https://sharp.pixelplumbing.com/install/)
