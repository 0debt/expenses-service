#Usamos una imagen base de Bun  -> Versión slim 
FROM oven/bun:latest-slim

#Establecemos el directorio de trabajo dentro del contenedor
WORKDIR /app

#Copiar los archivos de dependencias, guarda los datos en caché
COPY package.json .
COPY bun.lockb .

#Instalamos las dependencias
RUN bun install

#Copia el codigo del proyecto
COPY . .

#Exponer el puerto
EXPOSE 3000

#Arrancamos la aplicacion
CMD ["bun", "run", "index.ts"]