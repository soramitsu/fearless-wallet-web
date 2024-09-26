FROM nginxinc/nginx-unprivileged:1.27-alpine3.20
COPY ./dist /usr/share/nginx/html