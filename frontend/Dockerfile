# Usa una imagen base de Nginx para servir contenido estático
FROM nginx:alpine

# Elimina el contenido por defecto de Nginx
RUN rm -rf /usr/share/nginx/html/*

# Copia todos los archivos de tu frontend a la carpeta de Nginx
COPY . /usr/share/nginx/html

# Expone el puerto 80, ya que Nginx escucha en ese puerto
EXPOSE 80

# Comando por defecto para iniciar Nginx en primer plano
CMD ["nginx", "-g", "daemon off;"]
