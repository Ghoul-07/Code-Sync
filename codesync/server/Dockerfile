FROM node:20-alpine

RUN apk add --no-cache \
  g++ \
  make \
  python3 \
  openjdk17-jre

WORKDIR /app

# copy package.json and package-lock.json

COPY package*.json ./

# install production dependencies only
RUN npm install --production


COPY . . 

EXPOSE 5000

CMD ["node", "src/server.js"]
