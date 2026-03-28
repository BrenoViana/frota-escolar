FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY tsconfig.json ./tsconfig.json
COPY src ./src
ENV API_PORT=8000
EXPOSE 8000
CMD ["npm","run","start:dev"]
