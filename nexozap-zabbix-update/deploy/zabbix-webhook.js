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
