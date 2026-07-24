# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.18.0
FROM node:${NODE_VERSION}-alpine

ENV NODE_ENV=production \
    DATA_DIR=/data

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

COPY --chown=node:node . .
RUN mkdir -p /data && chown node:node /data

USER node
VOLUME ["/data"]

CMD ["node", "src/cli.js", "daemon"]
