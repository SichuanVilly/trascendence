import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

function Home() {
  const navigate = useNavigate();
  const username = localStorage.getItem("username") || "Usuario";
  const token = localStorage.getItem("token");
  const [users, setUsers] = useState([]);
  const [socket, setSocket] = useState(null);
  const [incomingInvite, setIncomingInvite] = useState(null);
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const [invitedUser, setInvitedUser] = useState(null);
  const [roomId, setRoomId] = useState(localStorage.getItem("roomId") || null);
  const [invitePopup, setInvitePopup] = useState(null);

  useEffect(() => {
    if (!token) {
      navigate("/");
      return;
    }

    let ws;
    let connectInterval;

    // Función para conectar el websocket de online_users
    const connectWebSocket = () => {
      const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
      const wsUrl = `${wsProtocol}://localhost:8000/ws/online_users/?token=${token}`;
      console.log(`🔗 Conectando a WebSocket: ${wsUrl}`);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("✅ Conectado al WebSocket de online_users");
        setSocket(ws);
        if (connectInterval) clearTimeout(connectInterval);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Actualizamos la lista de usuarios
          if (data.users) {
            setUsers(data.users || []);
          } 
          // Si recibimos una invitación y es para este usuario
          else if (data.type === "invite" && data.to === username) {
            setIncomingInvite(data);
          } 
          // Al recibir el mensaje de inicio de juego, redirigimos a la sala de Pong
          else if (data.type === "start_game") {
            localStorage.setItem("roomId", data.game_data.room);
            localStorage.setItem("player", data.game_data.player_1 === username ? "1" : "2");
            navigate(`/pong/room/${data.game_data.room}`);
          } 
          // Si se cancela una invitación
          else if (data.type === "cancel_invite") {
            if (data.to === username) setIncomingInvite(null);
            if (data.from === username) {
              setWaitingForResponse(false);
              setInvitedUser(null);
            }
          }
        } catch (error) {
          console.error("❌ Error al parsear JSON recibido:", error);
        }
      };

      ws.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
      };

      ws.onclose = (event) => {
        console.log("🔌 WebSocket cerrado", event);
        setSocket(null);
        // Intenta reconectar cada 3 segundos
        connectInterval = setTimeout(() => {
          connectWebSocket();
        }, 3000);
      };
    };

    connectWebSocket();

    // Limpieza: se cierra el websocket y se cancela el reconector
    return () => {
      console.log("Desmontando Home, cerrando WebSocket");
      if (ws) ws.close();
      if (connectInterval) clearTimeout(connectInterval);
    };
  }, [token, navigate, username]);

  // Función para cerrar sesión: cierra el websocket y limpia localStorage
  const handleLogout = () => {
    localStorage.clear();
    if (socket) socket.close();
    navigate("/");
  };

  // Función para invitar a un usuario: se muestra el pop-up de confirmación
  const inviteUser = (user) => {
    if (socket && user !== username) {
      setInvitePopup(user);
    }
  };

  // Confirmar el envío de la invitación
  const confirmInviteUser = () => {
    if (!socket || !invitePopup) return;
    // Enviamos el mensaje de invitación (el backend se encargará de generar el roomId)
    const message = {
      type: "invite",
      from: username,
      to: invitePopup,
    };
    socket.send(JSON.stringify(message));
    setInvitePopup(null);
    setWaitingForResponse(true);
    setInvitedUser(invitePopup);
  };

  // Aceptar una invitación recibida
  const acceptInvite = () => {
    if (!socket || !incomingInvite) return;
    const message = {
      type: "accept_invite",
      from: username,
      to: incomingInvite.from,
    };
    socket.send(JSON.stringify(message));
    setIncomingInvite(null);
  };

  // Rechazar una invitación recibida
  const rejectInvite = () => {
    if (socket && incomingInvite) {
      const message = {
        type: "reject_invite",
        from: username,
        to: incomingInvite.from,
      };
      socket.send(JSON.stringify(message));
    }
    setIncomingInvite(null);
  };

  // Cancelar una invitación enviada
  const cancelInvite = () => {
    if (socket && waitingForResponse) {
      const message = {
        type: "cancel_invite",
        from: username,
        to: invitedUser,
      };
      socket.send(JSON.stringify(message));
      setWaitingForResponse(false);
      setInvitedUser(null);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Barra lateral con la lista de usuarios conectados */}
      <div style={{ width: "250px", background: "#f0f0f0", padding: "10px", overflowY: "auto" }}>
        <h3>Usuarios Conectados</h3>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {users.map((user, index) => (
            <li
              key={index}
              style={{ cursor: user !== username ? "pointer" : "default" }}
              onClick={() => user !== username && inviteUser(user)}
            >
              {user} {user === username && "(Tú)"}
            </li>
          ))}
        </ul>
      </div>
      {/* Área principal */}
      <div style={{ flexGrow: 1, textAlign: "center", paddingTop: "50px" }}>
        <h1>Bienvenido, {username}</h1>
        <button onClick={handleLogout}>Cerrar Sesión</button>
      </div>
      {/* Pop-up de invitación para invitar a otro usuario */}
      {invitePopup && (
        <div style={{
          position: "fixed",
          top: "10px",
          left: "10px",
          background: "white",
          padding: "15px",
          border: "2px solid black",
          borderRadius: "8px",
          zIndex: 1000,
        }}>
          <p>¿Invitar a {invitePopup} a jugar?</p>
          <button onClick={confirmInviteUser}>Sí</button>
          <button onClick={() => setInvitePopup(null)}>No</button>
        </div>
      )}
      {/* Pop-up de invitación recibida */}
      {incomingInvite && (
        <div style={{
          position: "fixed",
          top: "0px",
          left: "0px",
          background: "white",
          padding: "15px",
          border: "2px solid black",
          borderRadius: "8px",
          zIndex: 9999,
        }}>
          <p>
            <strong>{incomingInvite.from}</strong> te ha invitado a jugar.
          </p>
          <button onClick={acceptInvite}>Aceptar</button>
          <button onClick={rejectInvite}>Rechazar</button>
        </div>
      )}
      {/* Pop-up de espera de respuesta a una invitación enviada */}
      {waitingForResponse && (
        <div style={{
          position: "fixed",
          bottom: "10px",
          right: "10px",
          background: "lightyellow",
          padding: "10px",
          border: "1px solid black",
          borderRadius: "8px",
          zIndex: 1000,
        }}>
          <p>Esperando respuesta de {invitedUser}...</p>
          <button onClick={cancelInvite}>Cancelar invitación</button>
        </div>
      )}
    </div>
  );
}

export default Home;
