# Servidor de partidas do Merge do Escritório (WebSocket + API do painel de administração).
# A página do jogo é publicada à parte, como site estático.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Só o que o servidor precisa para rodar.
COPY tsconfig.json ./
COPY src ./src
COPY tools ./tools

# Dentro do contêiner o servidor precisa escutar em todas as interfaces; a exposição para fora é decidida por quem roda.
ENV HOST=0.0.0.0 \
    PORT=8787 \
    DATA_DIR=/data

# Conteúdo editado no painel e sprites: precisa de um volume para não se perder quando o contêiner é recriado.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1

# Um processo só (sem intermediário), para o sinal de parada chegar direto ao servidor.
CMD ["node", "--import", "tsx", "tools/server.ts"]
