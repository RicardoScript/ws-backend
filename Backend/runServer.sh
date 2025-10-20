#!/bin/bash


# Construir la imagen Docker
echo "Construyendo la imagen Docker..."
docker build -t api-server .

# Eliminar el contenedor anterior si existe
if [ $(docker ps -a -q --filter name=api-server) ]; then
    echo "Eliminando el contenedor anterior..."
    docker rm -f api-server
fi

# Ejecutar el nuevo contenedor
echo "Ejecutando el nuevo contenedor..."
docker run --restart=always --name api-server -dp 3000:3000 api-server

echo "Script ejecutado con éxito."
docker logs -f api-server