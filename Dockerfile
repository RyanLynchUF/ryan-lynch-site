# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache git openssh-client
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Pre-populate GitHub host key so SSH doesn't prompt
RUN mkdir -p ~/.ssh && ssh-keyscan github.com >> ~/.ssh/known_hosts

# Clone private vault using BuildKit SSH mount (never stored in image layers)
RUN --mount=type=ssh \
    git clone --depth 1 git@github.com:RyanLynchUF/ryan-lynch-brain.git ../MyHub

ENV VAULT_PATH=../MyHub
RUN pnpm run build

FROM nginx:alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

EXPOSE 80
