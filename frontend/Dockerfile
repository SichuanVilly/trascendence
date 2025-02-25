# Usa una imagen base de Node.js
FROM node:18

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia package.json y package-lock.json antes de instalar las dependencias
COPY package*.json ./

# Instala las dependencias
RUN npm install

# Copia el resto del código del frontend
COPY . .

# Expone el puerto 3000
EXPOSE 3000

# Comando por defecto para iniciar el frontend
CMD ["npm", "start"]
