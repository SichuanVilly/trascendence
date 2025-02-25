import React, { useEffect, useState, useRef } from "react";

const PongGame = ({ roomId, username }) => {
  const token = localStorage.getItem("token");
  const [gameState, setGameState] = useState({
    paddle_1: 50,
    paddle_2: 50,
    ball_x: 50,
    ball_y: 50,
    score_1: 0,
    score_2: 0
  });

  const canvasRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${wsProtocol}://localhost:8000/ws/pong/${roomId}/?token=${token}`;
    console.log(`🔗 Conectando a WebSocket: ${wsUrl}`);
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log("✅ Conectado al WebSocket de Pong");
      // Enviar mensaje de join (si es necesario para el backend)
      const joinMessage = JSON.stringify({ type: "join", username });
      wsRef.current.send(joinMessage);
    };

    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("📥 Mensaje recibido:", data);
        // Manejo de diferentes tipos de mensajes:
        if (data.type === "update_paddle") {
          // Actualizamos la posición de la pala correspondiente sin afectar el resto del estado
          setGameState(prevState => ({
            ...prevState,
            [data.paddle]: data.position
          }));
        } else if (data.type === "game_update") {
          // Se asume que este mensaje contiene actualizaciones de la pelota y el marcador
          setGameState(prevState => ({
            ...prevState,
            ball_x: data.ball_x !== undefined ? data.ball_x : prevState.ball_x,
            ball_y: data.ball_y !== undefined ? data.ball_y : prevState.ball_y,
            score_1: data.score_1 !== undefined ? data.score_1 : prevState.score_1,
            score_2: data.score_2 !== undefined ? data.score_2 : prevState.score_2
          }));
        } else if (data.type === "room_update") {
          // Opcional: si deseas manejar cambios en la sala
          console.log("Room update:", data.players);
        } else {
          // Si se recibe un estado completo, lo reemplazamos
          setGameState(data);
        }
      } catch (error) {
        console.error("❌ Error al parsear JSON recibido:", error);
      }
    };

    wsRef.current.onerror = (error) => {
      console.error("❌ Error en WebSocket:", error);
    };

    wsRef.current.onclose = () => {
      console.log("🔌 WebSocket cerrado");
    };

    return () => {
      console.log("⚠️ Cerrando WebSocket antes de desmontar el componente");
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [roomId, username, token]);

  const movePaddle = (direction) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn("⚠️ WebSocket no está abierto para enviar datos");
      return;
    }

    const message = JSON.stringify({ type: "move_paddle", username, direction });
    console.log("📤 Enviando mensaje:", message);
    wsRef.current.send(message);
  };

  useEffect(() => {
    const handleKeyPress = (event) => {
      if (event.key === "ArrowUp" || event.key === "w") movePaddle(-10);
      if (event.key === "ArrowDown" || event.key === "s") movePaddle(10);
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // Limpiar el canvas y dibujar el fondo
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar las palas
    ctx.fillStyle = "white";
    ctx.fillRect(20, gameState.paddle_1 * (canvas.height / 100), 10, 50);
    ctx.fillRect(canvas.width - 30, gameState.paddle_2 * (canvas.height / 100), 10, 50);

    // Dibujar la pelota
    ctx.beginPath();
    ctx.arc(gameState.ball_x * (canvas.width / 100), gameState.ball_y * (canvas.height / 100), 5, 0, Math.PI * 2);
    ctx.fillStyle = "white";
    ctx.fill();
    ctx.closePath();
  }, [gameState]);

  return (
    <div style={{ textAlign: "center" }}>
      <h2>🎮 Pong Online - Sala {roomId}</h2>
      <p>Jugador: {username}</p>
      <canvas
        ref={canvasRef}
        width="600"
        height="400"
        style={{ border: "1px solid white", backgroundColor: "black" }}
      ></canvas>
      <p>🔴 Pelota en: {gameState.ball_x}, {gameState.ball_y}</p>
      <p>🏆 Marcador: {gameState.score_1} - {gameState.score_2}</p>
    </div>
  );
};

export default PongGame;
