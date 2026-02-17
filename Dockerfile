FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache git
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Clone vault content for build
ARG VAULT_REPO=https://github.com/RyanLynchUF/obsidian-my-hub.git
RUN git clone --depth 1 ${VAULT_REPO} ../MyHub
ENV VAULT_PATH=../MyHub

RUN pnpm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
