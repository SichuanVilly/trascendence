# Use official Python base image
FROM python:3.11

# Set working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
COPY django.sh /django.sh
RUN chmod +x /django.sh
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code

# Expose the port the app will run on
EXPOSE 8000

CMD ["sh", "/django.sh"]  