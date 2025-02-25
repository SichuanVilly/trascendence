import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

function Login({ setToken }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  // Validación de contraseña (debe incluir al menos un número)
  const isPasswordValid = (password) => /\d/.test(password);

  const handleAuth = async (e) => {
    e.preventDefault();

    if (!isPasswordValid(password)) {
      setMessage("La contraseña debe contener al menos un número.");
      return;
    }

    const url = isLogin
      ? "http://localhost:8000/api/users/login/"
      : "http://localhost:8000/api/users/register/";

    try {
      const response = await axios.post(url, { username, password });

      if (isLogin) {
        setToken(response.data.access);
        navigate("/home"); // Redirigir al Home
      } else {
        setMessage("Registro exitoso, ahora puedes iniciar sesión.");
        setIsLogin(true);
      }
    } catch (error) {
      setMessage(error.response?.data?.error || "Error en la autenticación.");
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>Transcendence</h1>
      <h2>{isLogin ? "Iniciar Sesión" : "Registrarse"}</h2>
      <form onSubmit={handleAuth}>
        <input type="text" placeholder="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit">{isLogin ? "Iniciar Sesión" : "Registrarse"}</button>
      </form>
      <button onClick={() => setIsLogin(!isLogin)}>
        {isLogin ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
      </button>
      <p style={{ color: "red" }}>{message}</p>
    </div>
  );
}

export default Login;
