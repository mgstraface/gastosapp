# Gastos

PWA para iPhone para llevar el control de gastos e ingresos del mes. Multiusuario: el admin crea las cuentas y cada persona tiene sus movimientos, categorías y presupuestos.

## Qué hace

- **Mes:** cuánto se gastó, ingresos, balance, promedio por día y cuánto queda del presupuesto. Gastos por categoría con su tope, tendencia de los últimos 6 meses y cuotas ya comprometidas para el mes siguiente.
- **Cargar un gasto o ingreso** (botón +): monto, moneda (pesos o dólares), categoría, detalle, fecha y medio de pago. Con crédito se puede cargar en **cuotas**: cada mes cuenta solo su cuota.
- **Movimientos:** lista por día con búsqueda y filtros por tipo y categoría.
- **Categorías:** crear, editar (nombre, ícono, color), poner un tope mensual, archivar.
- **Yo:** moneda principal, cambiar contraseña, descargar planilla CSV (abre en Excel), respaldo completo e importación, borrar datos, panel de usuarios (admin).

Los montos se guardan en centavos (enteros). Pesos y dólares se suman por separado, nunca se convierten solos.

## Estructura

```
apps/web         React + Vite (PWA, mobile-first)
apps/api         Node + Express + MongoDB
packages/shared  Esquemas Zod, montos, fechas, cuotas y resumen del mes
docker/          nginx interno del contenedor web (PWA + proxy a la API)
scripts/         deploy-vps.sh (deploy en el VPS compartido)
```

## Desarrollo

```bash
npm install
docker compose -f docker-compose.dev.yml up -d   # Mongo local
cp .env.example .env                             # completar ADMIN_PASSWORD
npm run dev                                      # API :4000 + web :5173
```

Para probar en el iPhone: abrir `http://<ip-de-tu-compu>:5173` en Safari desde la misma red.

## Producción (VPS)

Corre en el mismo VPS que Casa Roma, el robot y Nutrimapache. El nginx del VPS es el único que atiende los dominios y el HTTPS; cada proyecto publica sus contenedores solo en `127.0.0.1`, en puertos propios.

| Proyecto | Carpeta en el VPS | Web | Mongo |
|---|---|---|---|
| Robot (prod) | `/root/robot` | `127.0.0.1:8090` | `127.0.0.1:27020` |
| Robot (pruebas) | `/root/robot-dev` | `127.0.0.1:8091` | `127.0.0.1:27021` |
| Cachete Nutri | `/root/nutrimapache/app` | `127.0.0.1:8092` | `127.0.0.1:27022` |
| **Gastos** | `/root/gastosapp/app` | `127.0.0.1:8093` | `127.0.0.1:27023` |
| Casa Roma | `/root/casa_roma` | — | — |

Primera vez, en el VPS:

```bash
git clone git@github.com:mgstraface/gastosapp.git /root/gastosapp/app
bash /root/gastosapp/app/scripts/deploy-vps.sh   # crea el .env y se frena
nano /root/gastosapp/app/.env                    # completar DOMAIN
bash /root/gastosapp/app/scripts/deploy-vps.sh   # levanta, crea el sitio de nginx y pide HTTPS
```

La primera vez el script genera la contraseña del admin (usuario `mati`) y la muestra en pantalla; también queda en el `.env`. Con esa cuenta se entra a **Yo → Administrar usuarios** (o `/admin`) para crear las demás cuentas.

Después, cada push a `main` despliega solo (`.github/workflows/deploy.yml`). Mientras no estén cargados los secrets, el workflow avisa y no hace nada. Secrets del repo: `VPS_HOST`, `VPS_PORT`, `VPS_USER` y `VPS_SSH_KEY`, con una **clave SSH nueva y propia** de este proyecto, restringida en `authorized_keys` del VPS:

```
command="bash /root/gastosapp/app/scripts/deploy-vps.sh",no-port-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... gastosapp-deploy
```

No reusar la clave del robot, la de Casa Roma ni la de Nutrimapache: una clave con `command=` corre siempre ese script, sin importar qué repo la use.

En el iPhone: Safari → Compartir → **Agregar a inicio**.

## Ideas para después

- Gastos fijos que se repiten todos los meses (alquiler, servicios, suscripciones).
- Cuentas compartidas (gastos de la casa entre dos personas).
- Cotización del dólar para ver todo en una sola moneda.
- Cargar un gasto desde una foto del ticket o un texto ("café 2500").
