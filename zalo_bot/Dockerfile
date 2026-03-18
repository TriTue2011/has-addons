FROM node:20-alpine
RUN apk add --no-cache jq python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm install && npm install zca-js@latest
COPY . .
RUN chmod +x entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
