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
  window.location.href = 'home.html';
}

// Variables globales para el juego
let paddle1Pos = 50; // posición (0 a 100) de la pala izquierda
let paddle2Pos = 50; // posición (0 a 100) de la pala derecha
// Usamos una única variable para la bola que se actualiza directamente desde el servidor
let ballPos = { x: 50, y: 50 }; // posición de la bola (en porcentaje)

// Variable para identificar la pala del usuario (se asigna a partir de room_update)
let myPaddle = null;
// Objeto para almacenar los nombres de los jugadores, que llegan en room_update
let players = { player1: null, player2: null };

// Variable para indicar que el juego terminó (para deshabilitar nuevos movimientos)
let gameOver = false;

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

    if (data.type === "game_over") {
      gameOver = true;
      displayGameOver(data);
      return; // Detenemos el procesamiento de otros mensajes
    }

    if (data.type === "room_update") {
      // Actualizamos los nombres de los jugadores
      players = data.players;
      console.log("Room update recibido, players:", players);
      // Asigna la pala según el usuario actual
      if (players.player1 === currentUser) {
        myPaddle = "paddle_1";
      } else if (players.player2 === currentUser) {
        myPaddle = "paddle_2";
      }
      // Actualiza los divs con los nombres de los jugadores
      updatePlayerNames();
    } else if (data.type === "update_paddle") {
      if (data.paddle === "paddle_1") {
        paddle1Pos = data.position;
      } else if (data.paddle === "paddle_2") {
        paddle2Pos = data.position;
      }
    } else if (data.type === "game_update") {
      // Actualiza la posición de la bola y la puntuación con los valores enviados por el servidor
      if (data.ball_x !== undefined && data.ball_y !== undefined) {
        ballPos.x = data.ball_x;
        ballPos.y = data.ball_y;
      }
      if (data.score1 !== undefined && data.score2 !== undefined) {
        updateScore(data.score1, data.score2);
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

// Función para convertir un porcentaje a píxeles (verticalmente)
function percToPixel(perc) {
  return (perc / 100) * canvasHeight;
}

// Función para actualizar los nombres de los jugadores en los divs superiores
function updatePlayerNames() {
  const leftNameDiv = document.getElementById("leftPlayerName");
  const rightNameDiv = document.getElementById("rightPlayerName");
  leftNameDiv.textContent = players.player1 ? players.player1 : "Jugador 1";
  rightNameDiv.textContent = players.player2 ? players.player2 : "Jugador 2";
}

// Función para actualizar la puntuación en pantalla (debajo del área de juego)
function updateScore(score1, score2) {
  const leftScoreDiv = document.getElementById("leftScore");
  const rightScoreDiv = document.getElementById("rightScore");
  leftScoreDiv.textContent = score1;
  rightScoreDiv.textContent = score2;
}

// Dibuja el juego en el canvas (sin dibujar nombres ni puntuación)
function drawGame() {
  // Limpia el canvas
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Dibuja el fondo
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Calcula las posiciones horizontales para las palas
  const leftPaddleX = (5 / 100) * canvasWidth;
  const rightPaddleX = (95 / 100) * canvasWidth - paddleWidth;
  // Calcula las posiciones verticales
  const paddle1Y = percToPixel(paddle1Pos) - paddleHeight / 2;
  const paddle2Y = percToPixel(paddle2Pos) - paddleHeight / 2;

  // Dibuja las palas
  ctx.fillStyle = "#fff";
  ctx.fillRect(leftPaddleX, paddle1Y, paddleWidth, paddleHeight);
  ctx.fillRect(rightPaddleX, paddle2Y, paddleWidth, paddleHeight);

  // Dibuja la bola usando la posición actual recibida del servidor
  const ballX = (ballPos.x / 100) * canvasWidth;
  const ballY = (ballPos.y / 100) * canvasHeight;
  ctx.beginPath();
  ctx.arc(ballX, ballY, ballRadius, 0, 2 * Math.PI);
  ctx.fill();
}

// Bucle de animación: se dibuja la posición enviada por el servidor, sin interpolar
function gameLoop() {
  if (!gameOver) { // Solo se dibuja si el juego no ha terminado
    drawGame();
    requestAnimationFrame(gameLoop);
  }
}
gameLoop();

// Manejar eventos de teclado para mover la pala (deshabilitados si el juego terminó)
document.addEventListener('keydown', (e) => {
  if (gameOver) return;
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


// Función para mostrar el pop up de Game Over
function displayGameOver(gameData) {
  // gameData debe incluir: score1, score2 y winner
  const modalOverlay = document.createElement("div");
  modalOverlay.style.position = "fixed";
  modalOverlay.style.top = 0;
  modalOverlay.style.left = 0;
  modalOverlay.style.width = "100%";
  modalOverlay.style.height = "100%";
  modalOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
  modalOverlay.style.display = "flex";
  modalOverlay.style.flexDirection = "column";
  modalOverlay.style.justifyContent = "center";
  modalOverlay.style.alignItems = "center";
  modalOverlay.style.zIndex = 1000;

  // Mensaje según si el usuario ganó o perdió
  const resultMessage = document.createElement("h2");
  if (currentUser === gameData.winner) {
    resultMessage.textContent = "¡Has ganado!";
  } else {
    resultMessage.textContent = "Has perdido";
  }
  resultMessage.style.color = "#fff";

  // Muestra el nombre del ganador y la puntuación final
  const infoMessage = document.createElement("p");
  infoMessage.textContent = `Ganador: ${gameData.winner} | ${gameData.score1} - ${gameData.score2}`;
  infoMessage.style.color = "#fff";
  infoMessage.style.fontSize = "24px";

  // Botón para volver al home
  const homeButton = document.createElement("button");
  homeButton.textContent = "Volver al Home";
  homeButton.style.padding = "10px 20px";
  homeButton.style.fontSize = "18px";
  homeButton.style.marginTop = "20px";
  homeButton.onclick = () => {
    window.location.href = "home.html";
  };

  modalOverlay.appendChild(resultMessage);
  modalOverlay.appendChild(infoMessage);
  modalOverlay.appendChild(homeButton);

  document.body.appendChild(modalOverlay);
}
