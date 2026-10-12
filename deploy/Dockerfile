FROM node:24-bookworm-slim
WORKDIR /app
COPY worker ./worker
COPY static ./static
COPY scripts/build-prototype.mjs ./scripts/build-prototype.mjs
COPY .openai/hosting.json ./.openai/hosting.json
COPY package.json ./package.json
COPY drizzle ./drizzle
COPY standalone ./standalone
RUN node scripts/build-prototype.mjs && mkdir /data && chown node:node /data
USER node
ENV PORT=8080 BIND_ADDRESS=0.0.0.0 EA_DATA_DIR=/data NODE_ENV=production
EXPOSE 8080
CMD ["node","standalone/server.mjs"]
