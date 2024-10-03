# Use official Python base image
FROM python:3.11

# Set working directory inside the Docker container
WORKDIR /app

# Instalar dependencias del sistema necesarias
RUN apt-get update && apt-get install -y \
    build-essential \
    libssl-dev \
    libffi-dev \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Copiar el archivo requirements.txt y ejecutar la instalación de dependencias
COPY back/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt




RUN pip install --no-cache-dir -r requirements.txt

COPY ../trascendence /app/trascendence

EXPOSE 8000

CMD ["sh", "/django.sh"]
