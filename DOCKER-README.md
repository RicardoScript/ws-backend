# Web Scraping - Configuración Docker

Este proyecto ha sido dockerizado para facilitar su despliegue y desarrollo. Incluye un backend en Node.js, un frontend en React/Vite y una base de datos MongoDB.

## 📋 Prerrequisitos

- [Docker](https://www.docker.com/get-started) instalado
- [Docker Compose](https://docs.docker.com/compose/install/) instalado

## 🚀 Inicio Rápido

### Usando PowerShell (Windows)

```powershell
# Construir las imágenes
.\docker-manage.ps1 -Action build

# Iniciar todos los servicios
.\docker-manage.ps1 -Action up

# Ver el estado de los servicios
.\docker-manage.ps1 -Action status
```

### Usando Docker Compose directamente

```bash
# Construir las imágenes
docker-compose build

# Iniciar todos los servicios
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener servicios
docker-compose down
```

## 🌐 Acceso a los Servicios

Una vez que los contenedores estén ejecutándose:

- **Frontend**: http://18.217.24.122:81
- **MongoDB**: mongodb://18.217.24.122:27017

## 📊 Servicios Incluidos

### 🖥️ Frontend
- **Puerto**: 80
- **Tecnología**: React + Vite + TypeScript
- **Servidor web**: Nginx
- **Build optimizado**: Multi-stage build para producción

### 🗄️ Base de Datos
- **Puerto**: 27017
- **Tecnología**: MongoDB 7.0
- **Persistencia**: Volumen Docker para datos
- **Credenciales por defecto**:
  - Usuario admin: `admin`
  - Contraseña: `password123`
  - Base de datos: `webscraping`

## 🛠️ Comandos Útiles

### Script de Manejo (PowerShell)

```powershell
# Ver ayuda
.\docker-manage.ps1 -Action help

# Construir imágenes
.\docker-manage.ps1 -Action build

# Iniciar servicios
.\docker-manage.ps1 -Action up

# Ver logs de todos los servicios
.\docker-manage.ps1 -Action logs

# Ver logs de un servicio específico
.\docker-manage.ps1 -Action logs -Service backend

# Reiniciar servicios
.\docker-manage.ps1 -Action restart

# Detener servicios
.\docker-manage.ps1 -Action down

# Limpiar todo (contenedores, imágenes, volúmenes)
.\docker-manage.ps1 -Action clean

# Ver estado de los servicios
.\docker-manage.ps1 -Action status
```

### Comandos Docker Compose

```bash
# Ver logs en tiempo real
docker-compose logs -f

# Ver logs de un servicio específico
docker-compose logs -f backend

# Escalar un servicio
docker-compose up -d --scale backend=2

# Reconstruir un servicio específico
docker-compose build backend

# Ejecutar comando en un contenedor
docker-compose exec backend npm run dev

# Ver procesos activos
docker-compose ps

# Ver uso de recursos
docker stats
```

## 🔧 Configuración Avanzada

### Variables de Entorno

Copia `.env.example` a `.env` y modifica los valores según sea necesario:

```bash
cp .env.example .env
```

### Desarrollo Local

Para desarrollo local, puedes montar los volúmenes de código:

```yaml
# Agregar en docker-compose.yml bajo el servicio backend
volumes:
  - ./Web Scraping/Backend:/app
  - /app/node_modules
```

### Configuración de MongoDB

La base de datos se inicializa automáticamente con el script `init-mongo.js`. Puedes modificar este archivo para agregar datos iniciales o configuraciones específicas.

## 🐛 Troubleshooting

### Problema: Puerto ya en uso
```bash
# Verificar qué proceso usa el puerto
netstat -ano | findstr :80
netstat -ano | findstr :3001

# Detener servicios conflictivos
docker-compose down
```

### Problema: Permisos de archivos (Linux/Mac)
```bash
# Dar permisos de ejecución al script
chmod +x docker-manage.sh
```

### Problema: MongoDB no conecta
```bash
# Verificar logs de MongoDB
docker-compose logs mongodb

# Recrear volumen de MongoDB
docker-compose down -v
docker-compose up -d
```

### Problema: Frontend no carga
```bash
# Verificar logs del frontend
docker-compose logs frontend

# Reconstruir frontend
docker-compose build frontend
docker-compose up -d frontend
```

## 📦 Estructura de Archivos Docker

```
├── docker-compose.yml          # Orquestación de servicios
├── docker-manage.ps1           # Script de manejo (Windows)
├── docker-manage.sh            # Script de manejo (Linux/Mac)
├── init-mongo.js              # Inicialización de MongoDB
├── .env.example               # Variables de entorno ejemplo
└── Web Scraping/
    ├── Backend/
    │   ├── Dockerfile         # Imagen del backend
    │   └── .dockerignore      # Archivos a ignorar
    └── Frontend/
        ├── Dockerfile         # Imagen del frontend
        ├── nginx.conf         # Configuración de Nginx
        └── .dockerignore      # Archivos a ignorar
```

## 🔒 Consideraciones de Seguridad

- Cambiar las credenciales por defecto de MongoDB en producción
- Usar variables de entorno para secrets
- Configurar HTTPS para producción
- Actualizar regularmente las imágenes base

## 📈 Monitoreo

Para monitorear el estado de los contenedores:

```bash
# Ver uso de recursos
docker stats

# Ver logs de sistema
docker system events

# Ver información detallada de un contenedor
docker inspect web-scraping-backend
```
