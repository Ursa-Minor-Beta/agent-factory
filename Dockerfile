FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Only shipped dependencies; dev tooling advisories don't affect the image
RUN npm audit --omit=dev --audit-level=high

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]
