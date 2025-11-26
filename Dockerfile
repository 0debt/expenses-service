#Usamos una imagen base de Bun  -> Versión slim 
FROM oven/bun:1 as base

#Establecemos el directorio de trabajo dentro del contenedor
WORKDIR /app

#Copiar los archivos de dependencias, guarda los datos en caché
COPY package.json .
COPY bun.lock .

#Instalamos las dependencias
RUN bun install --frozen-lockfile --production

#Copia el codigo del proyecto
COPY . .

#Exponer el puerto
EXPOSE 3000

#Definimos variables de entorno por defecto (Coolify puede sobreescribirlas)
ENV NODE_ENV=production

#Arrancamos la aplicacion
CMD ["bun", "run", "src/index.ts"]