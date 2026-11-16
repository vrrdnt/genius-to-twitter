# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.18.0
FROM node:${NODE_VERSION}-alpine

ENV NODE_ENV=production \
    DATA_DIR=/data \
    LYRICS_PYTHON=/opt/lyrics/bin/python

WORKDIR /usr/src/app

COPY requirements-lyrics.txt ./
RUN apk add --no-cache python3 py3-pip \
    && python3 -m venv /opt/lyrics \
    && /opt/lyrics/bin/pip install --no-cache-dir --only-binary=:all: -r requirements-lyrics.txt

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

COPY --chown=node:node . .
RUN mkdir -p /data && chown node:node /data

USER node
VOLUME ["/data"]

CMD ["node", "src/cli.js", "daemon"]
