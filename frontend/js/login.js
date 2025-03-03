document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
  
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
  
    try {
      const response = await fetch('http://localhost:8000/api/users/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
  
      const data = await response.json();
      console.log("Respuesta del servidor:", data);
      if (response.ok) {
        let token;
        if (data.access) {
          token = data.access;
        } else if (data.token) {
          token = data.token;
        }
  
        if (token) {
          console.log("Token recibido:", token);
          // Guarda el token en el localStorage
          localStorage.setItem('token', token);
          // Guarda el nombre de usuario; se espera que el backend retorne "username", 
          // de lo contrario, se usa el valor ingresado en el formulario
          if (data.username) {
            localStorage.setItem('username', data.username);
          } else {
            localStorage.setItem('username', username);
          }
          window.location.href = 'home.html';
        } else {
          alert("No se recibió token. Verifica la respuesta del servidor.");
        }
      } else {
        alert(data.error || 'Error al iniciar sesión');
      }
    } catch (error) {
      console.error('Error:', error);
    }
  });
  