# 多阶段构建：最终镜像只包含运行所需的文件（约 200MB）
FROM node:24-alpine AS base
RUN npm install -g pnpm@11.22.0 --no-fund --no-audit

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
# 默认知识库打进镜像；docker-compose 里会用服务器上的 knowledge 文件夹覆盖，改资料不用重新构建
COPY --chown=app:app knowledge ./knowledge
RUN mkdir -p data && chown app:app data
USER app
EXPOSE 3000
CMD ["node", "server.js"]
