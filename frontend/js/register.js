document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
  
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
  
    try {
      const response = await fetch('http://localhost:8000/api/users/register/', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
  
      const data = await response.json();
      if (response.ok) {
        alert('Registro exitoso, ahora puedes iniciar sesión');
        window.location.href = 'index.html';
      } else {
        alert(data.error || 'Error en el registro');
      }
    } catch (error) {
      console.error('Error:', error);
    }
  });
  