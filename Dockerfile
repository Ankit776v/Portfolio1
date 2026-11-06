FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 PORTFOLIO_DATA_DIR=/data
COPY --from=build /app /app
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["npm", "start"]
