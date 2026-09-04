# syntax=docker/dockerfile:1

# ============================================================
# AgentNexus 前端镜像：Vite 构建 → Nginx 静态托管 + 反向代理
# ============================================================

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
