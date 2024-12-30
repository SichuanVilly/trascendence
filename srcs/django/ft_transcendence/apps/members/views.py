from django.http import JsonResponse
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.views.decorators.csrf import csrf_exempt
import json

# Main Page View
def main(request):
    return JsonResponse({"message": "Welcome to the main page!"})

# Login View
@csrf_exempt
def login_view(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        username = data.get('username')
        password = data.get('password')
        user = authenticate(username=username, password=password)
        if user is not None:
            login(request, user)
            return JsonResponse({"message": "Login successful", "username": user.username}, status=200)
        return JsonResponse({"error": "Invalid username or password"}, status=400)
    return JsonResponse({"error": "Invalid request method"}, status=405)

# Register View
@csrf_exempt
def register_view(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        username = data.get('username')
        password = data.get('password')

        # Validate username and password
        if not username or not password:
            return JsonResponse({"error": "Username and password are required"}, status=400)
        if User.objects.filter(username=username).exists():
            return JsonResponse({"error": "Username already exists"}, status=400)

        # Password validation
        errors = []
        if len(password) < 8:
            errors.append("Password must be at least 8 characters long")
        if not any(char.isdigit() for char in password):
            errors.append("Password must contain at least one number")
        if not any(char.isupper() for char in password):
            errors.append("Password must contain at least one uppercase letter")
        if not any(char.islower() for char in password):
            errors.append("Password must contain at least one lowercase letter")
        if not any(char in "!@#$%^&*()_+-=[]{}|;:,.<>?/~`" for char in password):
            errors.append("Password must contain at least one special character")
        
        if errors:
            return JsonResponse({"error": errors}, status=400)

        # Create user
        User.objects.create_user(username=username, password=password)
        return JsonResponse({"message": "User registered successfully"}, status=201)
    return JsonResponse({"error": "Invalid request method"}, status=405)

# Logout View
@csrf_exempt
def logout_view(request):
    if request.method == 'POST':
        logout(request)
        return JsonResponse({"message": "Logout successful"}, status=200)
    return JsonResponse({"error": "Invalid request method"}, status=405)
