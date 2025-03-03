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
  
  // Obtiene el token y el nombre de usuario (guardados en el login)
  const token = localStorage.getItem('token');
  const currentUser = localStorage.getItem('username');
  if (!token || !currentUser) {
    window.location.href = 'index.html';
  }
  
  // Variables globales para el juego
  let paddle1Pos = 50; // posición (0 a 100) de la pala izquierda
  let paddle2Pos = 50; // posición (0 a 100) de la pala derecha
  let ballPos = { x: 50, y: 50 }; // posición de la bola (en porcentaje)
  
  // Variable para identificar la pala del usuario (se asigna a partir de room_update)
  let myPaddle = null;
  
  // Crea la URL del WebSocket para el juego Pong
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
  
      if (data.type === "room_update") {
        // data.players: { player1: "username1", player2: "username2" }
        if (data.players.player1 === currentUser) {
          myPaddle = "paddle_1";
        } else if (data.players.player2 === currentUser) {
          myPaddle = "paddle_2";
        }
      }
      else if (data.type === "update_paddle") {
        if (data.paddle === "paddle_1") {
          paddle1Pos = data.position;
        } else if (data.paddle === "paddle_2") {
          paddle2Pos = data.position;
        }
      }
      else if (data.type === "game_update") {
        // Actualiza la posición de la bola (y otros parámetros, si se envían)
        if (data.ball_x !== undefined && data.ball_y !== undefined) {
          ballPos.x = data.ball_x;
          ballPos.y = data.ball_y;
        }
      }
    } catch (e) {
      console.error("Error al parsear el mensaje:", e);
    }
  };
  
  socket.onclose = (event) => {
    console.log("WebSocket de Pong cerrado", event);
  };
  
  // Configuración del canvas
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  
  const paddleWidth = 10;
  const paddleHeight = 80;
  const ballRadius = 10;
  
  // Convierte un porcentaje a píxeles (verticalmente)
  function percToPixel(perc) {
    return (perc / 100) * canvasHeight;
  }
  
  // Dibuja el juego en el canvas
  function drawGame() {
    // Limpia el canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Dibuja el fondo
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Dibuja las palas
    ctx.fillStyle = "#fff";
    const paddle1Y = percToPixel(paddle1Pos) - paddleHeight / 2;
    ctx.fillRect(20, paddle1Y, paddleWidth, paddleHeight);
    
    const paddle2Y = percToPixel(paddle2Pos) - paddleHeight / 2;
    ctx.fillRect(canvasWidth - 20 - paddleWidth, paddle2Y, paddleWidth, paddleHeight);
    
    // Dibuja la bola
    const ballX = (ballPos.x / 100) * canvasWidth;
    const ballY = (ballPos.y / 100) * canvasHeight;
    ctx.beginPath();
    ctx.arc(ballX, ballY, ballRadius, 0, 2 * Math.PI);
    ctx.fill();
  }
  
  // Bucle de animación
  function gameLoop() {
    drawGame();
    requestAnimationFrame(gameLoop);
  }
  gameLoop();
  
  // Manejar eventos de teclado para mover la pala
  document.addEventListener('keydown', (e) => {
    let direction = 0;
    if (e.key === "ArrowUp") {
      direction = -5;
    } else if (e.key === "ArrowDown") {
      direction = 5;
    }
    if (direction !== 0 && myPaddle !== null) {
      // Determina la posición actual de la pala controlada
      const currentPos = (myPaddle === "paddle_1") ? paddle1Pos : paddle2Pos;
      socket.send(JSON.stringify({
        type: "move_paddle",
        username: currentUser,
        direction: direction,
        position: currentPos
      }));
    }
  });
  
  // Función para iniciar el countdown y luego enviar un mensaje para iniciar el juego
  function startCountdown() {
    let countdownValue = 3;
    const countdownEl = document.getElementById("countdown");
    countdownEl.style.display = "block";
    countdownEl.textContent = countdownValue;
    
    const intervalId = setInterval(() => {
      countdownValue--;
      if (countdownValue > 0) {
        countdownEl.textContent = countdownValue;
      } else {
        countdownEl.textContent = "¡GO!";
        clearInterval(intervalId);
        setTimeout(() => {
          countdownEl.style.display = "none";
          // Envía un mensaje al servidor para iniciar el juego
          socket.send(JSON.stringify({ type: "start_game", room: roomId }));
        }, 500);
      }
    }, 1000);
  }
  
  // Inicia el countdown al cargar la página
  startCountdown();
  