# MarsWalk Copilot — pantalla (web/ui con el mapa de web/map), servida con nginx
# Construir desde la raíz:  docker build -f web/Dockerfile -t marswalk-web .

# ---- 1) compilar ----
FROM node:22-slim AS build
WORKDIR /repo
# web/ui importa el mapa (web/map/src), los datos de prueba (contracts/) y web/shared
COPY web/ui/package.json web/ui/package-lock.json web/ui/
RUN cd web/ui && npm ci --no-audit --no-fund
COPY contracts/ contracts/
COPY web/ web/
# El navegador llama a la API por el mismo dominio: nginx reenvía /api/* al contenedor api
ARG VITE_API_BASE=/api
ARG VITE_API_URL=/api
ENV VITE_API_BASE=$VITE_API_BASE VITE_API_URL=$VITE_API_URL
RUN cd web/ui && npm run build

# ---- 2) servir ----
FROM nginx:1.27-alpine
COPY web/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/web/ui/dist /usr/share/nginx/html
EXPOSE 80
