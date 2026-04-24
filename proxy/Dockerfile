FROM oven/bun:1.1-alpine

WORKDIR /app

# Build context is the repo root (see captain-definition / docker-compose.yml).
COPY proxy/server.ts ./server.ts

ENV PORT=8080
ENV OPENROUTER_API_KEY=""
ENV MODEL=""

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["bun", "run", "server.ts"]
