FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:standalone
FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/dist-standalone ./dist-standalone
COPY --from=build /app/lib ./lib
COPY --from=build /app/standalone ./standalone
COPY --from=build /app/drizzle ./drizzle
COPY package.json ./
RUN mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=8787 DATA_DIR=/data
EXPOSE 8787
CMD ["node", "standalone/server.mjs"]
