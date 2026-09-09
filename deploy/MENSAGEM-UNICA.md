# Gráfico e texto na mesma mensagem

O texto completo recebido do Zabbix passa a ser a legenda da imagem. Quando o gráfico está disponível, o NexoZap faz apenas um envio de foto com legenda. O assunto e o corpo continuam definidos no Zabbix; não é necessário alterar o webhook, ItemId ou .env.

Se a obtenção do gráfico falhar ou os gráficos estiverem desativados, envia apenas o texto. A busca de imagem agora ocorre antes de qualquer envio e pode acrescentar até o orçamento de 8 segundos ao tempo até o alerta.

Se o envio da foto falhar, a API retorna HTTP 502. Não envia texto adicional automaticamente, porque uma falha de resposta pode ocorrer após a foto já ter sido enviada. As tentativas do Zabbix continuam aplicáveis e ainda podem gerar duplicatas: este MVP não oferece deduplicação ou entrega exatamente uma vez.

## Instalar

No Windows, atualize sua cópia com git pull --ff-only antes de copiar o CONTEÚDO do ZIP para a raiz do projeto. Publique:

```powershell
git add src/http-api.js test/graph-alerts.test.js deploy/GRAFICOS.md deploy/MENSAGEM-UNICA.md
git commit -m "Envia gráfico com texto do alerta na legenda"
git push
```

No servidor:

```bash
cd /opt/nexozap
sudo -u nexozap git pull --ff-only
sudo systemctl restart nexozap-api
sudo journalctl -u nexozap-api -n 30 --no-pager
```

Não há novas dependências. Aguarde WhatsApp conectado e use o teste de mídia com Subject e Message reais e ItemId 309983. Espere uma foto cuja legenda contenha o assunto e a mensagem, sem envio de texto separado. A mudança atende tanto a problemas quanto a recuperações. A validação local cobre envio único, legenda, fallback de download, gráficos desativados e falha de envio; o teste real é feito no servidor.
