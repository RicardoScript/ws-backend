# Usamos Node 18 Alpine
FROM node:18-alpine

# Instalar dependencias de sistema para compilar módulos nativos y canvas
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    bash \
    pkgconfig \
    cairo-dev \
    pango-dev \
    giflib-dev \
    libpng-dev \
    jpeg-dev \
    giflib-dev \
    pixman-dev

# Definir directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json ./

# Instalar dependencias de Node (incluye módulos nativos como canvas)
RUN npm install --force

# Copiar el resto del código y el archivo .env
COPY . .
COPY .env .env

# Exponer el puerto del backend
EXPOSE 3000

# Comando por defecto para iniciar el servidor
CMD ["npm", "run", "server"]
