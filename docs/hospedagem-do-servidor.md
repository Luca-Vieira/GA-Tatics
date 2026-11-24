# Publicando o jogo numa VPS que já tem outro projeto

O jogo roda isolado, num grupo próprio de contêineres, e **não usa as portas 80 e 443**. Ele abre uma única porta, visível só dentro da VPS (`127.0.0.1:8090`). O proxy que já atende o outro projeto passa a encaminhar um **subdomínio** para essa porta.

```
internet ──HTTPS──> proxy que já existe na VPS ──┬─> outro projeto (como está hoje)
                                                 └─> 127.0.0.1:8090  (jogo)
                                                        │
                                       contêiner "web" (Caddy: página e /admin)
                                                        │  /ws, /api, /sprites, /health
                                       contêiner "servidor" (partidas, volume "dados")
```

Como tudo sai do mesmo endereço, o jogo e o `/admin` já vêm com o endereço certo preenchido.

> O jogo precisa de um **subdomínio próprio** (`jogo.seu-dominio.com`). Ele não funciona numa subpasta, como `seu-dominio.com/jogo`.

## Para não afetar o outro projeto

- Instale o jogo numa **pasta separada**.
- Antes de recarregar o proxy, **teste a configuração** (no nginx, `sudo nginx -t`). Faça uma cópia dos arquivos antes de editar.
- Crie um **arquivo novo** de site para o jogo; não edite o bloco do outro projeto.
- Não rode `docker system prune` nem comandos como `docker stop $(docker ps -q)`, que valem para a VPS inteira.
- Construir a página consome memória por alguns minutos. Com pouca memória livre, crie um swap antes ou construa num horário tranquilo. Depois de no ar, o jogo fica limitado a cerca de 512 MB no total.

## 1. Diagnóstico (só leitura, não muda nada)

```bash
sudo ss -tlnp | grep -E ':(80|443|8090)\s'
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
docker --version && docker compose version
free -h
df -h /
```

- A primeira linha mostra **quem usa as portas 80 e 443** (`nginx`, `apache2`, `caddy` ou `docker-proxy`, quando o proxy é um contêiner). Isso decide o passo 4.
- Se a 8090 aparecer ocupada, escolha outra em `WEB_PORT`.
- Sem Docker, instale pelo [guia oficial](https://docs.docker.com/engine/install/) para a sua distribuição.

## 2. Subdomínio

Crie um registro `A` do subdomínio do jogo apontando para o IP da VPS.

## 3. Subir o jogo

No seu computador, envie o código (`git add`, `git commit`, `git push`). Na VPS:

```bash
git clone https://github.com/Luca-Vieira/GA-Tatics.git merge-do-escritorio
cd merge-do-escritorio
cp .env.example .env
nano .env
chmod 600 .env
docker compose up -d --build
curl http://127.0.0.1:8090/health
```

No `.env`, preencha `SITE_DOMAIN` (só o nome, sem `https://`), `ADMIN_USERNAME` e `ADMIN_PASSWORD` (8 caracteres ou mais; use uma senha forte e exclusiva). Se o repositório for privado, use uma chave de implantação ou um token do GitHub no `git clone`.

O último comando deve responder `{"status":"ok"}`. Até aqui nada mudou para o outro projeto.

## 4. Ligar o proxy que já existe

Siga **só** a parte do proxy que apareceu no diagnóstico. Em todos os casos o proxy precisa encaminhar **WebSocket** e aceitar envios de até 3 MB (publicação no painel).

### nginx instalado na VPS

Crie um arquivo novo, por exemplo `/etc/nginx/sites-available/zz-merge-do-escritorio` (em distribuições sem essa pasta, `/etc/nginx/conf.d/zz-merge-do-escritorio.conf`).

> **Por que o `zz-`:** quando nenhum site está marcado como `default_server`, o nginx entrega ao **primeiro que carregar** (ordem alfabética dentro da pasta) os acessos pelo IP ou por um nome desconhecido. Com o `zz-`, o jogo carrega depois dos sites que já existem e não passa a receber esses acessos.

```nginx
# Nome exclusivo, para não colidir com um "map" que o outro projeto já tenha.
map $http_upgrade $merge_connection {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name jogo.seu-dominio.com;

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $merge_connection;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        client_max_body_size 3m;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/zz-merge-do-escritorio /etc/nginx/sites-enabled/   # só se usar sites-available
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d jogo.seu-dominio.com
```

O `&&` garante que o nginx só é recarregado se a configuração passar no teste. O `certbot` cria o HTTPS apenas para o subdomínio do jogo.

### Caddy instalado na VPS

Acrescente ao `Caddyfile` que já existe, valide e recarregue:

```
jogo.seu-dominio.com {
    reverse_proxy 127.0.0.1:8090
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

### Apache instalado na VPS

Ative `proxy`, `proxy_http` e `headers` (`sudo a2enmod proxy proxy_http headers`) e crie um site novo (Apache 2.4.47 ou mais novo, por causa do `upgrade=websocket`):

```apache
<VirtualHost *:80>
    ServerName jogo.seu-dominio.com
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:8090/ upgrade=websocket
    ProxyPassReverse / http://127.0.0.1:8090/
</VirtualHost>
```

```bash
sudo apachectl configtest && sudo systemctl reload apache2
sudo certbot --apache -d jogo.seu-dominio.com
```

### Proxy em contêiner (Traefik, Nginx Proxy Manager, Caddy no Docker)

Um proxy dentro do Docker **não alcança** `127.0.0.1` da VPS. Coloque o contêiner do jogo na mesma rede do proxy, criando na pasta do jogo um `docker-compose.override.yml` (ele não vai para o repositório):

```yaml
services:
  web:
    networks: [default, proxy]

networks:
  proxy:
    external: true
    name: NOME_DA_REDE_DO_PROXY   # veja com: docker network ls
```

Rode `docker compose up -d` e aponte o proxy para `http://merge-do-escritorio-web-1:80`, com WebSocket ligado. Os rótulos (Traefik) ou a tela (Nginx Proxy Manager) dependem de como o proxy está configurado hoje.

## 5. Conferir

- `https://jogo.seu-dominio.com/health` responde `{"status":"ok"}`.
- O jogo abre; em "Conectar" o endereço já vem como `wss://jogo.seu-dominio.com/ws`, e a "Partida rápida" cria uma sala.
- `https://jogo.seu-dominio.com/admin` abre o painel. Publique uma pequena alteração, rode `docker compose restart servidor` e confirme que ela continua lá.
- O outro projeto continua respondendo normalmente.

## Dia a dia (na pasta do jogo)

| Para | Comando |
| --- | --- |
| Atualizar o jogo | `git pull && docker compose up -d --build` |
| Ver o que está acontecendo | `docker compose logs -f` |
| Reiniciar | `docker compose restart` |
| Parar só o jogo | `docker compose down` |
| Copiar o conteúdo do painel e os sprites | `docker compose cp servidor:/data ./copia-dos-dados` |

Atualizar ou reiniciar **encerra as partidas em andamento**. **Nunca** use `docker compose down -v`: o `-v` apaga o conteúdo e os sprites.

## Se algo não funcionar

| Sintoma | Provável causa |
| --- | --- |
| `curl http://127.0.0.1:8090/health` falha | Contêiner não subiu: `docker compose ps` e `docker compose logs`. |
| `port is already allocated` | A porta está em uso: defina outra em `WEB_PORT`. |
| O proxy responde 502 | Porta diferente da do `.env`, jogo parado, ou proxy em contêiner tentando usar `127.0.0.1`. |
| A página abre, mas "Conectar" falha | O proxy não encaminha WebSocket, ou o log do `servidor` mostra `origem não permitida (...)`: esse endereço precisa estar em `ALLOWED_ORIGINS`. |
| Publicar no painel dá erro 413 | Falta o limite de 3 MB no proxy (`client_max_body_size`). |
| O painel diz que está desligado | Faltam `ADMIN_USERNAME` ou `ADMIN_PASSWORD`, ou a senha é curta. Edite o `.env` e rode `docker compose up -d`. |
| A construção termina com `Killed` | Faltou memória: crie um swap. |

## Testar antes de ter o subdomínio

No `.env`, use `SITE_DOMAIN=teste.local`, `WEB_BIND=0.0.0.0` e `ALLOWED_ORIGINS=http://IP-DA-VPS:8090`, e abra `http://IP-DA-VPS:8090`. **Atenção:** portas publicadas pelo Docker ignoram o `ufw`, e **não há criptografia** (não use uma senha de verdade no painel). Volte ao padrão quando terminar.

## Variáveis do `.env`

| Variável | Padrão | Para quê |
| --- | --- | --- |
| `SITE_DOMAIN` | obrigatória | Subdomínio do jogo. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | vazio | Login do painel. Sem os dois, o painel fica desligado. |
| `WEB_PORT` | `8090` | Porta interna do jogo na VPS. |
| `WEB_BIND` | `127.0.0.1` | Onde a porta fica visível. Só mude para testar. |
| `ALLOWED_ORIGINS` | `https://SITE_DOMAIN` | Páginas que podem conectar (protocolo, domínio e porta, **sem caminho**). |

Rodando sem Docker, o servidor usa `HOST`, `PORT`, `DATA_DIR` e `TRUST_PROXY` (veja `src/multiplayer/host/serverConfig.ts`).

## Cuidados de segurança

- Não há login de jogador: quem conhece o endereço consegue criar salas. A lista de origens protege os navegadores das pessoas, **não é autenticação**. Os limites do servidor (64 conexões, 16 salas, mensagens por segundo) contêm abusos simples.
- Mantenha a VPS atualizada, entre por chave SSH e guarde cópias do conteúdo de vez em quando (o servidor guarda só a versão atual).
