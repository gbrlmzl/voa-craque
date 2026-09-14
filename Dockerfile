FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .

# O build nao acessa o banco: toda pagina que le dados e dinamica.
ENV AUTH_SECRET=build-time-placeholder
ENV DATABASE_URL=postgresql://user:pass@localhost:5432/db?schema=public
RUN npx prisma generate && npx next build

RUN chmod +x docker/entrypoint.sh && mkdir -p /app/uploads

EXPOSE 3000
CMD ["./docker/entrypoint.sh"]
