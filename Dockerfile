FROM --platform=linux/amd64 node:24.13.0-bookworm-slim@sha256:46feb5752989c05b8606e6323fbbc3db667d14ade1c24f5d0d44d9ca9909d607 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM --platform=linux/amd64 node:24.13.0-bookworm-slim@sha256:46feb5752989c05b8606e6323fbbc3db667d14ade1c24f5d0d44d9ca9909d607 AS runtime
WORKDIR /app
ARG SOURCE_COMMIT
LABEL org.opencontainers.image.revision=$SOURCE_COMMIT
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "run", "start", "--", "--port", "3000"]
