FROM oven/bun:latest AS builder

WORKDIR /app

ARG VITE_REACT_APP_SERVER_URL
ENV VITE_REACT_APP_SERVER_URL=${VITE_REACT_APP_SERVER_URL}

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
ENV DISABLE_ESLINT_PLUGIN=true
RUN bun run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/ /usr/share/nginx/html/

EXPOSE 80
