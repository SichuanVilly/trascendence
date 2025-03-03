// pong.js

// Función para obtener parámetros de la URL
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
  }
  
  // Obtiene el room id del query string (ejemplo: pong.html?room=xxx)
  const roomId = getQueryParam('room');
  if (!roomId) {
    alert("No se especificó room id.");
    throw new Error("Room id not specified");
  }
  
  // Obtiene el token y el nombre de usuario (deben haberse guardado en login)
  const token = localStorage.getItem('token');
  const currentUser = localStorage.getItem('username');
  if (!token || !currentUser) {
    window.location.href = 'index.html';
  }
  
  // Crea la URL del WebSocket para el juego Pong, incluyendo el token para autenticar
  const wsUrl = `ws://localhost:8000/ws/pong/${roomId}/?token=${token}`;
  console.log("Conectando a Pong WebSocket en:", wsUrl);
  const socket = new WebSocket(wsUrl);
  
  socket.onopen = () => {
    console.log("Conectado al WebSocket de Pong");
  };
  
  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log("Mensaje recibido:", data);
      if (data.type === "update_paddle") {
        // Se espera { type:"update_paddle", paddle:"paddle_1" or "paddle_2", position: <number> }
        if (data.paddle === "paddle_1") {
          paddle1Pos = data.position;
        } else if (data.paddle === "paddle_2") {
          paddle2Pos = data.position;
        }
      } else if (data.type === "game_update") {
        // Supongamos que el servidor envía la posición de la bola
        if (data.ball_x !== undefined && data.ball_y !== undefined) {
          ballPos.x = data.ball_x;
          ballPos.y = data.ball_y;
        }
        // Aquí podrías actualizar otros parámetros (por ejemplo, puntuaciones)
      }
    } catch (e) {
      console.error("Error al parsear el mensaje:", e);
    }
  };
  
  socket.onclose = (event) => {
    console.log("WebSocket de Pong cerrado", event);
  };
  
  // Configuración del canvas y estado del juego
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  
  // Estado de las palas y la bola (usamos porcentajes de la altura/anchura)
  // Posiciones de palas (0 a 100, representando porcentaje de la altura del canvas)
  let paddle1Pos = 50;
  let paddle2Pos = 50;
  // Posición de la bola (0 a 100)
  let ballPos = { x: 50, y: 50 };
  
  // Constantes del juego
  const paddleWidth = 10;
  const paddleHeight = 80;
  const ballRadius = 10;
  
  // Función para convertir porcentaje a píxeles (vertical)
  function percToPixel(perc) {
    return (perc / 100) * canvasHeight;
  }
  
  // Dibuja el juego en el canvas
  function drawGame() {
    // Limpia el canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Fondo
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Dibuja las palas
    ctx.fillStyle = "#fff";
    // Pala izquierda (jugador 1)
    const paddle1Y = percToPixel(paddle1Pos) - paddleHeight / 2;
    ctx.fillRect(20, paddle1Y, paddleWidth, paddleHeight);
    
    // Pala derecha (jugador 2)
    const paddle2Y = percToPixel(paddle2Pos) - paddleHeight / 2;
    ctx.fillRect(canvasWidth - 20 - paddleWidth, paddle2Y, paddleWidth, paddleHeight);
    
    // Dibuja la bola
    const ballX = (ballPos.x / 100) * canvasWidth;
    const ballY = (ballPos.y / 100) * canvasHeight;
    ctx.beginPath();
    ctx.arc(ballX, ballY, ballRadius, 0, 2 * Math.PI);
    ctx.fill();
  }
  
  // Bucle de animación para el canvas
  function gameLoop() {
    drawGame();
    requestAnimationFrame(gameLoop);
  }
  gameLoop();
  
  // Manejar eventos de teclado para mover la pala
  // Suponemos que el jugador que controla la izquierda (paddle_1) usa las flechas
  document.addEventListener('keydown', (e) => {
    let direction = 0;
    if (e.key === "ArrowUp") {
      direction = -5;
    } else if (e.key === "ArrowDown") {
      direction = 5;
    }
    if (direction !== 0) {
      // Enviamos el movimiento de la pala al servidor.
      // Para este ejemplo, se envía el valor "direction" y se envía también la posición actual (o un valor base, p.ej. 50)
      socket.send(JSON.stringify({
        type: "move_paddle",
        username: currentUser,
        direction: direction,
        position: paddle1Pos  // Enviamos la posición actual para que el servidor la actualice
      }));
      // (El servidor es quien determina la posición final y luego la reenvía a todos.)
    }
  });
  