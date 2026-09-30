FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/mqtt-bridge/package.json ./services/mqtt-bridge/package.json
RUN npm ci --no-audit --no-fund
COPY shared ./shared
COPY services/mqtt-bridge ./services/mqtt-bridge
RUN npm run bridge:build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/mqtt-bridge/package.json ./services/mqtt-bridge/package.json
RUN npm ci --omit=dev --workspace=@climate-shelter/mqtt-bridge --include-workspace-root=false --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/services/mqtt-bridge/dist ./services/mqtt-bridge/dist
USER node
EXPOSE 8080
CMD ["node", "services/mqtt-bridge/dist/services/mqtt-bridge/src/index.js"]
