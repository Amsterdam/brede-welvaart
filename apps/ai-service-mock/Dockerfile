FROM node:24.21.0-alpine

WORKDIR /app

RUN npm install -g tsx@4.20.0

COPY apps/ai-service-mock/package.json ./package.json
COPY apps/ai-service-mock/tsconfig.json ./tsconfig.json
COPY apps/ai-service-mock/src ./src
COPY apps/ai-service-mock/fixtures ./fixtures

ENV PORT=8000
EXPOSE 8000

CMD ["tsx", "src/server.ts"]
