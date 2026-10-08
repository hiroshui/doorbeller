FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
COPY scripts/patch-alexa.cjs ./scripts/patch-alexa.cjs
RUN npm ci --omit=dev --ignore-scripts && node scripts/patch-alexa.cjs && mkdir /data && chown node:node /data
COPY --chown=node:node src ./src
USER node
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "src/main.js"]
