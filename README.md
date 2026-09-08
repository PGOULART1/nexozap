# NexoZap

MVP independente para conectar uma conta ao WhatsApp por QR Code e enviar textos ou arquivos usando Baileys. O projeto não abre Chromium e não depende de nenhuma instalação do `beezap2`.

> **Aviso:** Baileys é uma biblioteca comunitária e não oficial. Use apenas com contatos que autorizaram as mensagens, evite disparos em massa e respeite os termos do WhatsApp. Atualizações do WhatsApp podem exigir uma atualização da biblioteca.

## Ambiente de destino

O ambiente principal é Linux. O exemplo abaixo instala o projeto em `/opt/nexozap`, mantém as credenciais em `/var/lib/nexozap/session` e executa o processo com um usuário próprio, sem acesso administrativo.

Requisitos:

- servidor Linux com `systemd`;
- Node.js 20 ou superior (`.nvmrc` recomenda Node 24);
- npm disponível no sistema;
- acesso ao terminal para o primeiro QR Code.

## Instalação no Linux

```bash
sudo useradd --system --create-home --home-dir /var/lib/nexozap --shell /usr/sbin/nologin nexozap
sudo mkdir -p /opt/nexozap /var/lib/nexozap/session
sudo chown -R nexozap:nexozap /opt/nexozap /var/lib/nexozap
```

Copie o conteúdo deste projeto para `/opt/nexozap`. Depois instale somente as dependências de produção e prepare a configuração:

```bash
cd /opt/nexozap
sudo -u nexozap npm install --omit=dev
sudo -u nexozap cp .env.example .env
sudo chmod 600 .env
```

Se o executável do Node não estiver em `/usr/bin/node`, descubra o caminho com `command -v node` e ajuste `ExecStart` em `deploy/nexozap.service`.

## Primeiro login por QR Code

Faça o primeiro login manualmente como o mesmo usuário do serviço. Isso garante que os arquivos da sessão tenham o proprietário correto:

```bash
cd /opt/nexozap
sudo -u nexozap /usr/bin/node src/cli.js login
```

No celular, abra **WhatsApp > Aparelhos conectados > Conectar um aparelho** e escaneie o QR Code exibido. Pela configuração Linux, a sessão fica em `/var/lib/nexozap/session` e será reutilizada nos próximos inícios.

Com a mensagem “WhatsApp conectado” visível, pressione `Ctrl+C`. A sessão não será apagada.

Nunca envie essa pasta para terceiros ou para um repositório. Ela contém credenciais de longa duração.

## Executar continuamente com systemd

O projeto inclui um serviço pronto em `deploy/nexozap.service`:

```bash
sudo cp /opt/nexozap/deploy/nexozap.service /etc/systemd/system/nexozap.service
sudo systemctl daemon-reload
sudo systemctl enable --now nexozap
sudo systemctl status nexozap
```

Para acompanhar a conexão e os erros:

```bash
sudo journalctl -u nexozap -f
```

Operações comuns:

```bash
sudo systemctl restart nexozap
sudo systemctl stop nexozap
```

## Enviar uma mensagem

Use país + DDD + número. Para um número brasileiro, por exemplo:

Como este MVP persiste a sessão em arquivos, não execute dois processos usando a mesma sessão. Pare o serviço antes de usar um comando avulso e ligue-o novamente ao terminar:

```bash
sudo systemctl stop nexozap
cd /opt/nexozap
sudo -u nexozap /usr/bin/node src/cli.js text 5554999999999 "Teste enviado pelo NexoZap"
sudo systemctl start nexozap
```

## Enviar PDF ou outro arquivo

```bash
sudo systemctl stop nexozap
cd /opt/nexozap
sudo -u nexozap /usr/bin/node src/cli.js file 5554999999999 ./documentos/teste.pdf "Segue o PDF"
sudo systemctl start nexozap
```

PDF, documentos do Office, texto, CSV, ZIP e imagens comuns têm o MIME type reconhecido. Outros formatos são enviados como arquivo binário. O limite padrão é 50 MiB e pode ser alterado no `.env`.

## Configuração

Crie `.env` a partir de `.env.example`. As principais opções são:

| Variável | Finalidade |
| --- | --- |
| `SESSION_DIR` | Local onde as credenciais ficam persistidas |
| `LOG_LEVEL` | Nível de detalhe dos logs |
| `LOG_PRETTY` | Logs legíveis no terminal ou JSON para produção |
| `CONNECT_TIMEOUT_MS` | Prazo para login/conexão antes de um envio falhar |
| `RECONNECT_*` | Intervalos mínimo e máximo da reconexão exponencial |
| `MAX_FILE_SIZE_MB` | Limite preventivo para arquivos |

## Estrutura

```text
nexozap/
├── src/
│   ├── cli.js                 # comandos do MVP
│   ├── config.js              # leitura e validação do .env
│   ├── logger.js              # logs estruturados
│   ├── whatsapp-client.js     # conexão, sessão, reconexão e envios
│   └── utils/                 # telefone e MIME types
├── deploy/
│   └── nexozap.service       # execução contínua no systemd
├── test/                      # testes sem conexão real
├── data/session/              # alternativa local, ignorada pelo Git
├── .env.example
└── package.json
```

## Próxima evolução: API HTTP

O núcleo está concentrado em `WhatsAppClient`, sem depender da interface de linha de comando. Uma API futura pode criar uma única instância no início do servidor e chamar:

```js
await client.sendText(telefone, mensagem);
await client.sendFile(telefone, caminho, legenda);
```

Os próximos passos naturais são adicionar um servidor HTTP, autenticação para as rotas, fila de envios, rate limiting e um armazenamento de sessão em banco. O próprio Baileys recomenda trocar `useMultiFileAuthState` por SQL/NoSQL em uma implantação de produção.

## Diagnóstico rápido

```bash
npm run check
npm test
```

- Se o QR não aparecer, pare o serviço, remova apenas `/var/lib/nexozap/session` e faça o login novamente.
- Se aparecer “sessão encerrada”, o aparelho foi desconectado no celular; remova a sessão e refaça o login.
- Se um envio falhar, confirme o número com país e DDD e acompanhe `journalctl -u nexozap -f`.
