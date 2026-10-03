# syntax=docker/dockerfile:1.7

# ---- deps: cached unless package files change ----
    FROM node:20-alpine AS deps
    WORKDIR /app
    COPY package*.json ./
    RUN npm ci
    
    # ---- dev: Vite dev server with HMR (source bind-mounted by compose) ----
    FROM deps AS dev
    COPY . .
    EXPOSE 3000
    CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
    
    # ---- build: produce static assets ----
    FROM deps AS build
    # Vite inlines VITE_* at build time; a runtime env var has no effect on a static bundle.
    ARG VITE_API_URL=http://localhost:8000
    ENV VITE_API_URL=$VITE_API_URL
    COPY . .
    RUN npm run build
    
    # ---- prod: tiny non-root nginx serving static files (no node, no npm) ----
    FROM nginxinc/nginx-unprivileged:1.27-alpine AS prod
    COPY nginx.conf /etc/nginx/conf.d/default.conf
    COPY --from=build /app/dist /usr/share/nginx/html
    EXPOSE 3000