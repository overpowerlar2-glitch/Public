# Tabiya — production image. Build: docker compose build   Run: docker compose up
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/copy-engine.mjs scripts/
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
RUN npm run build

# Native Stockfish 19 (full network). Set the build arg STOCKFISH=0 to skip it; the site then uses the browser engine.
FROM debian:bookworm-slim AS stockfish
ARG STOCKFISH=1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY scripts/build-stockfish.sh scripts/
RUN mkdir -p bin && if [ "$STOCKFISH" = "1" ]; then bash scripts/build-stockfish.sh sf_19 native; fi

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app ./
COPY --from=stockfish /src/bin ./bin
COPY docker-entrypoint.sh /usr/local/bin/
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
