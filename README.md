# NexoZap

MVP independente para conectar uma conta ao WhatsApp por QR Code, enviar textos e arquivos e encaminhar notificações do Zabbix a um grupo.

## Instalação e integração com Zabbix

Siga o **[guia completo de instalação Linux e Zabbix 7.0](deploy/ZABBIX.md)**, com todos os passos:

1. Preparar o Linux e clonar este repositório em /opt/nexozap.
2. Instalar dependências e configurar .env e permissões.
3. Autenticar pelo QR Code e consultar o ID do grupo.
4. Configurar o token e executar a API com systemd.
5. Ajustar o caminho do Node, incluindo o exemplo de override.
6. Criar o webhook, testar mensagens e configurar problema/recuperação.
7. Atualizar a instalação e diagnosticar os erros encontrados.

O **[script do webhook para copiar no Zabbix](deploy/zabbix-webhook.js)** está versionado e também aparece no guia.

## Ambiente e funcionamento

- Linux com systemd; Node 24 LTS recomendado para novas instalações.
- Código em /opt/nexozap e sessão em /var/lib/nexozap/session.
- API autenticada por token em 127.0.0.1:3000.
- Zabbix Server e NexoZap devem compartilhar o mesmo ambiente de rede local para este procedimento.
- O destino é fixado por ALERT_GROUP_ID no servidor.
- Serviço da integração: nexozap-api. O serviço antigo nexozap é apenas de login e deve ficar desativado ao usar a API.

Baileys é uma biblioteca comunitária e não oficial. Mudanças no WhatsApp podem exigir atualizações da integração.

## Arquivos principais

| Arquivo | Função |
| --- | --- |
| [deploy/ZABBIX.md](deploy/ZABBIX.md) | Guia completo de instalação e operação |
| [deploy/zabbix-webhook.js](deploy/zabbix-webhook.js) | Script executado no tipo de mídia Zabbix |
| deploy/nexozap-api.service | Serviço da API |
| src/server.js | Inicialização da API e conexão WhatsApp |
| src/http-api.js | Autenticação, validação e envio de alertas |
| src/groups.js | Lista os grupos e seus IDs |
| src/cli.js | Login e envios manuais |
| src/whatsapp-client.js | Sessão, conexão, reconexão e envio |
| .env.example | Modelo de configuração sem segredos |

## Texto e arquivos pelo terminal

Estes comandos são para uso avulso, a partir de /opt/nexozap. Pare nexozap-api antes, pois dois processos não devem usar a mesma sessão. Use o caminho do Node validado no seu servidor.

```bash
sudo systemctl stop nexozap-api
sudo -u nexozap node src/cli.js text 5554999999999 "Teste NexoZap"
sudo -u nexozap node src/cli.js file 5554999999999 ./documento.pdf "Segue o PDF"
sudo systemctl start nexozap-api
```

O usuário nexozap precisa ter permissão de leitura no arquivo. O limite configurável padrão é 50 MiB. A API de alertas recebe apenas texto; envio HTTP de arquivos ainda não foi implementado.

## Testes

Após instalar as dependências:

```bash
npm run check
npm test
```

Os testes locais não conectam uma conta real. Login pelo serviço e recebimento de mensagem pelo webhook foram confirmados na instalação acompanhada; ações automáticas de problema e recuperação ainda precisam ser testadas pelo operador.

## Credenciais e limites

.env.example pode ser público. Não publique .env, API_TOKEN, QR Code ou arquivos de sessão. Os logs do Baileys podem conter identificadores pessoais; revise antes de compartilhar.

O MVP não tem fila persistente nem deduplicação. HTTP 200 significa que a chamada ao Baileys concluiu, não confirma leitura no celular. Falha de resposta após um envio pode causar duplicação na tentativa seguinte. Veja o guia para as opções de tentativas do Zabbix.

