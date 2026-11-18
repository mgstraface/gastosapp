# Se construye desde la raíz del repo. Produce la PWA servida por un nginx interno.
# Debian (glibc) y no Alpine: con musl el parser de Rollup se queda sin pila con archivos grandes como react-dom
# ("Code is nested too deeply"). Solo es la etapa de build; lo que se sirve sigue siendo nginx alpine.
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm install --no-audit --no-fund
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @gastosapp/web

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
