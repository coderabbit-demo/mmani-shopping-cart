FROM --platform=linux/amd64 mcr.microsoft.com/playwright:v1.64.1-noble@sha256:ee15712262f017b8157421b212b12099146645f44b1bc5c0514cbbe6a229b1d0
ARG SOURCE_COMMIT
LABEL org.opencontainers.image.revision=$SOURCE_COMMIT
WORKDIR /checker
COPY package.json package-lock.json ./
RUN npm ci
COPY deploy/checker.mjs ./checker.mjs
USER pwuser
ENTRYPOINT ["node", "checker.mjs"]
