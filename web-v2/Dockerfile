FROM oven/bun:latest AS deps

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM node:20-bookworm-slim AS builder

WORKDIR /app

ARG VITE_API_BASE_URL
ARG VITE_REACT_APP_SERVER_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_REACT_APP_SERVER_URL=${VITE_REACT_APP_SERVER_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node scripts/vite.mjs build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/ /usr/share/nginx/html/

EXPOSE 80
