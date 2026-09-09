# NexoZap — instalação e operação

Integração entre Zabbix 7.0 e WhatsApp por Baileys, com autenticação via QR Code, sessão persistente e gráfico com o texto do alerta na legenda.

Leia o **[guia completo de instalação e produção](docs/INSTALACAO.md)**.

O guia cobre Linux, Git, dependências, .env, usuário de gráficos, login, grupo, serviço systemd, webhook, modelos de incidente/recuperação, testes, troca de celular, atualização e diagnóstico.

Este pacote contém documentação e uma cópia do webhook atual. Não contém o aplicativo completo nem credenciais. Adicione seu conteúdo à raiz do repositório NexoZap existente. O código é obtido pelo GitHub conforme o guia.

- [Script para copiar no Zabbix](deploy/zabbix-webhook.js)
- [Guia completo](docs/INSTALACAO.md)

Baileys é uma integração comunitária não oficial. O MVP não tem fila persistente ou deduplicação. Use um único processo por sessão e valide o recebimento no grupo antes de ampliar as ações de monitoramento.
