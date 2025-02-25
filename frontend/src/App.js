import React, { useState, useEffect } from "react"; // Importa React y hooks para manejar estado y ciclos de vida
import axios from "axios"; // Importa axios para realizar peticiones HTTP al backend
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams } from "react-router-dom"; // Importa herramientas de enrutamiento
import Home from "./Home"; // Componente para la página principal (home)
import PongGame from "./PongGame"; // Componente para el juego Pong

// Configuración global de axios: establece la URL base para todas las peticiones y define el header de contenido
axios.defaults.baseURL = "http://localhost:8000/api";
axios.defaults.headers.common["Content-Type"] = "application/json";

// Componente de autenticación que maneja el inicio de sesión y el registro de usuario
function Auth() {
  // Variables de estado para saber si se está en modo login, y para almacenar usuario, contraseña y mensajes
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate(); // Hook para redirigir al usuario a otras rutas

  // Función que se ejecuta al enviar el formulario de autenticación
  const handleAuth = async (e) => {
    e.preventDefault(); // Evita el comportamiento por defecto del formulario
    // Define la URL a la que se hará la petición, dependiendo de si es login o registro
    const url = isLogin ? "/users/login/" : "/users/register/";

    try {
      // Realiza la petición POST a la URL correspondiente enviando el username y la contraseña
      const response = await axios.post(url, { username, password });

      // Muestra un mensaje de éxito dependiendo de la acción realizada
      setMessage(
        isLogin
          ? `Bienvenido ${response.data.user.username}`
          : "Registro exitoso, ahora puedes iniciar sesión"
      );

      // Si es login, guarda el token y nombre de usuario en el localStorage, configura el header de autorización y redirige al home
      if (isLogin) {
        localStorage.setItem("token", response.data.access);
        localStorage.setItem("username", response.data.user.username);
        axios.defaults.headers.common["Authorization"] = `Bearer ${response.data.access}`;
        navigate("/home");
      }
    } catch (error) {
      // Si ocurre un error, se muestra el mensaje de error recibido o un mensaje genérico
      setMessage(error.response?.data?.error || "Error en autenticación");
    }
  };

  // Renderiza el formulario y botones para cambiar entre login y registro
  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>Transcendence</h1>
      <h2>{isLogin ? "Iniciar Sesión" : "Registrarse"}</h2>
      <form onSubmit={handleAuth} style={{ marginBottom: "20px" }}>
        {/* Campo para ingresar el nombre de usuario */}
        <input
          type="text"
          placeholder="Usuario"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          style={{ margin: "5px", padding: "10px", fontSize: "16px" }}
        />
        <br />
        {/* Campo para ingresar la contraseña */}
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ margin: "5px", padding: "10px", fontSize: "16px" }}
        />
        <br />
        {/* Botón para enviar el formulario */}
        <button type="submit" style={{ marginTop: "10px", padding: "10px" }}>
          {isLogin ? "Iniciar Sesión" : "Registrarse"}
        </button>
      </form>

      {/* Botón para alternar entre los modos de inicio de sesión y registro */}
      <button onClick={() => setIsLogin(!isLogin)}>
        {isLogin ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
      </button>

      {/* Muestra mensajes de información o error */}
      <p style={{ color: message.includes("error") ? "red" : "black" }}>{message}</p>
    </div>
  );
}

// Componente contenedor que extrae el parámetro 'roomId' de la URL y se lo pasa al componente PongGame
function PongWrapper() {
  let { roomId } = useParams(); // Obtiene el parámetro 'roomId' de la ruta
  return <PongGame roomId={roomId} />;
}

// Componente principal de la aplicación que define las rutas de navegación
function App() {
  return (
    <Router>
      <Routes>
        {/* Ruta raíz para la autenticación */}
        <Route path="/" element={<Auth />} />
        {/* Ruta para la página principal después de iniciar sesión */}
        <Route path="/home" element={<Home />} />
        {/* Ruta para acceder a la sala de Pong, pasando el roomId como parámetro */}
        <Route path="/pong/room/:roomId" element={<PongWrapper />} />
      </Routes>
    </Router>
  );
}

export default App; // Se exporta el componente App como el componente principal de la aplicación
