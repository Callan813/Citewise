# The API and worker share this image. Only the command differs, set in compose.
# Two stages, so TypeScript and other build tools never reach production.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY seed ./seed
# The volume for uploaded files inherits this owner.
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
# If the app is ever compromised, it isn't running as root.
USER node
EXPOSE 4000
CMD ["node", "--enable-source-maps", "dist/main.js"]
