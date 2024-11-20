FROM public.ecr.aws/amazonlinux/amazonlinux:latest

RUN dnf install -y nodejs

WORKDIR /app

COPY * /app

RUN npm install

RUN npm run build

EXPOSE 3000

CMD [ "npm", "start" ]