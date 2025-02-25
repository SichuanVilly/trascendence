import { registerUser } from "../api/api";

const handleRegister = async () => {
  try {
    const user = await registerUser("alberto", "Amarillo95");
    console.log("Usuario registrado:", user);
  } catch (error) {
    console.error("Error en el registro:", error);
  }
};
