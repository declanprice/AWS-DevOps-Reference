FROM public.ecr.aws/amazonlinux/amazonlinux:latest

RUN dnf install -y nodejs

WORKDIR /app

COPY * /app

RUN npm install

RUN ls

EXPOSE 8080

CMD [ "npm", "start" ]