FROM node:18-alpine

#Create App Directory
WORKDIR /RESTapi

#Install dependencies
COPY package*.json ./
RUN npm install
RUN npm install dotenv

COPY . .

EXPOSE 80

CMD [ "npm", "start" ]
