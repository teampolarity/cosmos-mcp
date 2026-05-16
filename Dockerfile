FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* tsconfig.json ./
RUN npm install

COPY src ./src
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist
COPY bin ./bin
COPY README.md LICENSE ./

ENTRYPOINT ["node", "dist/server.js"]
