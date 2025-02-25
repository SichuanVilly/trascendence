# Usamos la imagen oficial de Python 3.10
FROM python:3.10

# Establecemos el directorio de trabajo
WORKDIR /app

# Instalamos dependencias del sistema
RUN apt-get update && apt-get install -y netcat-openbsd && rm -rf /var/lib/apt/lists/*

# Copiamos los archivos de la aplicación
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app/

# Copiamos y damos permisos al entrypoint
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Exponemos el puerto
EXPOSE 8000

# Usamos el entrypoint.sh para manejar la inicialización
ENTRYPOINT ["/app/entrypoint.sh"]
