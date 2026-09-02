FROM node:20-alpine

WORKDIR /app

# install server deps (only "ws")
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund

# app code
COPY server ./server
COPY public ./public

ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --quiet --tries=1 --spider http://localhost:8080/healthz || exit 1

CMD ["node", "server/server.js"]
