import axios from "axios";

// Configuración de la API con la URL correcta
const API = axios.create({
  baseURL: "http://localhost:8000/api/users/", // Asegúrate de que coincide con el backend
  headers: {
    "Content-Type": "application/json",
  },
});

// Función para registrar usuario
export const registerUser = async (username, password) => {
  try {
    const response = await API.post("register/", {
      username,
      password,
    });
    return response.data;
  } catch (error) {
    console.error("Error en el registro:", error.response?.data || error.message);
    throw error;
  }
};

// Función para iniciar sesión
export const loginUser = async (username, password) => {
  try {
    const response = await API.post("login/", {
      username,
      password,
    });
    return response.data;
  } catch (error) {
    console.error("Error en el inicio de sesión:", error.response?.data || error.message);
    throw error;
  }
};

export default API;
