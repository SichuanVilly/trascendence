/* 
  main.js
  - Router con 2 websockets distintos, uno para #home (usuarios), otro para #pong (partida).
  - Cada vez que cambias de vista, cierras el WS anterior y abres el de la vista actual.
*/

/****************************************************
 * 1) VAR GLOBALES Y UTILIDADES: TOKEN, ...
 ****************************************************/
let userSocket = null;  // WebSocket de usuarios online (en #home)
let pongSocket = null;  // WebSocket de la partida (en #pong)

function getToken() {
  return localStorage.getItem("token");
}
function setToken(token) {
  localStorage.setItem("token", token);
}
function clearToken() {
  localStorage.removeItem("token");
}

function getUsername() {
  return localStorage.getItem("username");
}
function setUsername(username) {
  localStorage.setItem("username", username);
}
function clearUsername() {
  localStorage.removeItem("username");
}

// Para extraer parámetros después de "#pong?room=..."
function getHashQueryParam(param) {
  const hash = window.location.hash.replace("#", ""); // "pong?room=xxx"
  const queryIndex = hash.indexOf("?");
  if (queryIndex < 0) return null;
  const queryString = hash.slice(queryIndex + 1); // "room=xxx"
  const urlParams = new URLSearchParams(queryString);
  return urlParams.get(param);
}

/****************************************************
 * 2) ARRANQUE Y ROUTER
 ****************************************************/
window.addEventListener("load", () => {
  if (!window.location.hash) {
    if (getToken()) window.location.hash = "#home";
    else window.location.hash = "#login";
  }
  router();
});
window.addEventListener("hashchange", router);

function router() {
  const hash = window.location.hash.replace("#", "");
  const token = getToken();

  updateNavbarVisibility(!!token);

  // === CIERRE WS ===
  // Antes de cambiar de vista, cierra los websockets antiguos
  closeHomeWS();
  closePongWS();

  if (hash.startsWith("pong")) {
    // Vista PONG
    if (!token) {
      window.location.hash = "#login";
      return;
    }
    const roomId = getHashQueryParam("room");
    renderPongView(roomId);  // Esto abrirá pongSocket
    return;
  }

  // Otras vistas
  switch (hash) {
    case "login":
      if (token) window.location.hash = "#home";
      else renderLoginView();
      break;
    case "register":
      if (token) window.location.hash = "#home";
      else renderRegisterView();
      break;
    case "home":
      if (!token) window.location.hash = "#login";
      else renderHomeView();  // Esto abrirá userSocket
      break;
    case "logout":
      logout();
      break;
    default:
      if (token) window.location.hash = "#home";
      else window.location.hash = "#login";
  }
}

function updateNavbarVisibility(isLoggedIn) {
  const navLoginLink = document.getElementById("navLoginLink");
  const navRegisterLink = document.getElementById("navRegisterLink");
  const navHomeLink = document.getElementById("navHomeLink");
  const navLogoutLink = document.getElementById("navLogoutLink");

  if (isLoggedIn) {
    navLoginLink.classList.add("d-none");
    navRegisterLink.classList.add("d-none");
    navHomeLink.classList.remove("d-none");
    navLogoutLink.classList.remove("d-none");
  } else {
    navLoginLink.classList.remove("d-none");
    navRegisterLink.classList.remove("d-none");
    navHomeLink.classList.add("d-none");
    navLogoutLink.classList.add("d-none");
  }
}

function logout() {
  clearToken();
  clearUsername();
  window.location.hash = "#login";
}

/****************************************************
 * 3) LOGIN Y REGISTER
 ****************************************************/
function renderLoginView() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="row justify-content-center mt-5">
      <div class="col-md-4">
        <div class="card p-4 shadow">
          <h3 class="card-title text-center mb-3">Iniciar sesión</h3>
          <form id="loginForm">
            <div class="mb-3">
              <label for="username" class="form-label">Usuario</label>
              <input type="text" class="form-control" id="username" required>
            </div>
            <div class="mb-3">
              <label for="password" class="form-label">Contraseña</label>
              <input type="password" class="form-control" id="password" required>
            </div>
            <button type="submit" class="btn btn-primary w-100">Ingresar</button>
          </form>
          <p class="text-center mt-3">
            ¿No tienes cuenta? <a href="#register">Regístrate</a>
          </p>
        </div>
      </div>
    </div>
  `;

  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    try {
      const resp = await fetch("http://localhost:8000/api/users/login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await resp.json();
      if (resp.ok) {
        const token = data.access || data.token;
        if (!token) {
          alert("No se recibió token");
          return;
        }
        setToken(token);
        setUsername(data.username || username);
        window.location.hash = "#home";
      } else {
        alert(data.error || "Error al iniciar sesión");
      }
    } catch (err) {
      console.error("Error login:", err);
      alert("Error en la conexión al servidor");
    }
  });
}

function renderRegisterView() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="row justify-content-center mt-5">
      <div class="col-md-4">
        <div class="card p-4 shadow">
          <h3 class="card-title text-center mb-3">Registro</h3>
          <form id="registerForm">
            <div class="mb-3">
              <label for="username" class="form-label">Usuario</label>
              <input type="text" class="form-control" id="username" required>
            </div>
            <div class="mb-3">
              <label for="password" class="form-label">Contraseña</label>
              <input type="password" class="form-control" id="password" required>
            </div>
            <button type="submit" class="btn btn-primary w-100">Registrarse</button>
          </form>
          <p class="text-center mt-3">
            ¿Ya tienes cuenta? <a href="#login">Inicia sesión</a>
          </p>
        </div>
      </div>
    </div>
  `;

  document.getElementById("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    try {
      const resp = await fetch("http://localhost:8000/api/users/register/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await resp.json();
      if (resp.ok) {
        alert("Registro exitoso, ahora puedes iniciar sesión");
        window.location.hash = "#login";
      } else {
        alert(data.error || "Error en el registro");
      }
    } catch (err) {
      console.error("Error register:", err);
      alert("Error en la conexión al servidor");
    }
  });
}

/****************************************************
 * 4) VISTA HOME (abre userSocket)
 ****************************************************/
function renderHomeView() {
  const app = document.getElementById("app");
  const user = getUsername() || "Desconocido";

  app.innerHTML = `
    <div class="row">
      <div class="col-12 col-md-3 col-lg-2">
        <div class="bg-white h-100 p-3" style="min-height: 80vh;">
          <h5>Usuarios Online</h5>
          <ul class="nav flex-column" id="usersList"></ul>
        </div>
      </div>
      <div class="col-12 col-md-9 col-lg-10">
        <h1>Bienvenido, ${user}!</h1>
        <p>Haz clic en un usuario (en la lista izquierda) para invitarlo a jugar Pong.</p>
      </div>
    </div>
  `;

  initUsersWebSocket(); // Abre userSocket
}

function closeHomeWS() {
  // Cierra el userSocket si está abierto
  if (userSocket && userSocket.readyState === WebSocket.OPEN) {
    console.log("Cerrando userSocket (Home)...");
    userSocket.close();
  }
  userSocket = null;
}

function initUsersWebSocket() {
  const token = getToken();
  const currentUser = getUsername();
  if (!token || !currentUser) return;

  const wsUrl = `ws://localhost:8000/ws/online_users/?token=${token}`;
  console.log("Abriendo userSocket:", wsUrl);
  userSocket = new WebSocket(wsUrl);

  userSocket.onopen = () => console.log("userSocket abierto");
  userSocket.onclose = (evt) => console.log("userSocket cerrado", evt);
  userSocket.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.users) {
        updateUsersList(data.users, currentUser);
      } else if (data.type === "invite" && data.to === currentUser) {
        showInvitationReceived(data);
      } else if (data.type === "cancel_invite" && data.to === currentUser) {
        alert(`La invitación de ${data.from} ha sido cancelada.`);
      } else if (data.type === "start_game") {
        // Cierra modal e inicia #pong
        const inviteModal = document.getElementById("inviteModal");
        if (inviteModal) {
          const instance = bootstrap.Modal.getInstance(inviteModal);
          if (instance) instance.hide();
        }
        // El fromUser ha aceptado y se inicia la partida
        window.location.hash = `pong?room=${data.game_data.room}`;
      }
    } catch (err) {
      console.error("Error en userSocket.onmessage:", err);
    }
  };
}

function updateUsersList(users, currentUser) {
  const ul = document.getElementById("usersList");
  if (!ul) return; // Evita error si no estás en home

  ul.innerHTML = "";
  users.forEach((u) => {
    const li = document.createElement("li");
    li.className = "nav-item py-1";
    if (u === currentUser) {
      li.textContent = `${u} (tú)`;
    } else {
      li.textContent = u;
      li.style.cursor = "pointer";
      li.addEventListener("click", () => inviteUser(u, currentUser));
    }
    ul.appendChild(li);
  });
}

function inviteUser(toUser, fromUser) {
  document.getElementById("inviteModalTitle").textContent = `Invitar a ${toUser}`;
  document.getElementById("inviteModalBody").textContent = `¿Deseas invitar a ${toUser}?`;
  window.invitedUser = toUser;
  const modal = new bootstrap.Modal(document.getElementById("inviteModal"));
  modal.show();
}

// Botones del modal de invitación
const btnInviteConfirm = document.getElementById("btnInviteConfirm");
btnInviteConfirm.addEventListener("click", function() {
  const from = getUsername();
  const to = window.invitedUser;
  if (from && to && userSocket) {
    userSocket.send(JSON.stringify({ type: "invite", from, to }));
    document.getElementById("inviteModalTitle").textContent = "Esperando respuesta...";
    document.getElementById("inviteModalBody").textContent = `Esperando respuesta de ${to}...`;
    btnInviteConfirm.style.display = "none";
  }
});

const btnInviteCancel = document.getElementById("btnInviteCancel");
btnInviteCancel.addEventListener("click", function() {
  const from = getUsername();
  const to = window.invitedUser;
  if (from && to && userSocket) {
    userSocket.send(JSON.stringify({ type: "cancel_invite", from, to }));
  }
  window.invitedUser = null;
  btnInviteConfirm.style.display = "inline-block";
});

function showInvitationReceived(inviteData) {
  document.getElementById("inviteResponseModalTitle").textContent = "Invitación recibida";
  document.getElementById("inviteResponseModalBody").textContent = 
    `${inviteData.from} te ha invitado a jugar Pong. ¿Aceptas?`;
  window.inviteFromUser = inviteData.from;
  const modal = new bootstrap.Modal(document.getElementById("inviteResponseModal"));
  modal.show();
}

// Botones del modal de respuesta
const btnAcceptInvite = document.getElementById("btnAcceptInvite");
btnAcceptInvite.addEventListener("click", function() {
  const from = getUsername();
  const to = window.inviteFromUser;
  if (from && to && userSocket) {
    userSocket.send(JSON.stringify({ type: "accept_invite", from, to }));
  }
  hideInvitationModal();
});

const btnRejectInvite = document.getElementById("btnRejectInvite");
btnRejectInvite.addEventListener("click", function() {
  const from = getUsername();
  const to = window.inviteFromUser;
  if (from && to && userSocket) {
    userSocket.send(JSON.stringify({ type: "cancel_invite", from, to }));
    alert(`Has rechazado la invitación de ${to}`);
  }
  hideInvitationModal();
});

function hideInvitationModal() {
  const modalEl = document.getElementById("inviteResponseModal");
  const modal = bootstrap.Modal.getInstance(modalEl);
  if (modal) modal.hide();
  window.inviteFromUser = null;
}

/****************************************************
 * 5) VISTA PONG (abre pongSocket)
 ****************************************************/
function renderPongView(roomId) {
  const app = document.getElementById("app");
  if (!roomId) {
    app.innerHTML = "<p>Error: faltó 'roomId'</p>";
    return;
  }
  app.innerHTML = `
    <div class="text-center">
      <h2>Pong - Sala: ${roomId}</h2>
      <div id="playerNames" style="display:flex; justify-content:space-between; max-width:800px; margin:10px auto;">
        <div id="leftPlayerName">Jugador 1</div>
        <div id="rightPlayerName">Jugador 2</div>
      </div>
      <canvas id="gameCanvas" width="800" height="400"></canvas>
      <div class="mt-2 d-flex justify-content-between" style="max-width: 800px; margin: 0 auto;">
        <div id="leftScore">0</div>
        <div id="rightScore">0</div>
      </div>
      <p id="countdown" style="font-size:1.5rem; margin-top:10px;"></p>
    </div>
  `;

  // Reinciamos variables de Pong
  myPaddle = null;
  paddle1Pos = 50; 
  paddle2Pos = 50; 
  ballPos = { x: 50, y: 50 };
  gameOver = false;
  players = { player1: null, player2: null };

  initPongWebSocket(roomId);
  initPongCanvasLoop();
  startCountdown(roomId);
}

function closePongWS() {
  // Cierra el pongSocket si está abierto
  if (pongSocket && pongSocket.readyState === WebSocket.OPEN) {
    console.log("Cerrando pongSocket...");
    pongSocket.close();
  }
  pongSocket = null;
}

function initPongWebSocket(roomId) {
  const token = getToken();
  const currentUser = getUsername();
  if (!token || !currentUser) {
    window.location.hash = "#login";
    return;
  }
  const wsUrl = `ws://localhost:8000/ws/pong/${roomId}/?token=${token}`;
  console.log("Abriendo pongSocket:", wsUrl);
  pongSocket = new WebSocket(wsUrl);

  pongSocket.onopen = () => console.log("WS Pong abierto");
  pongSocket.onclose = (e) => console.log("WS Pong cerrado", e);
  pongSocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "game_over") {
        gameOver = true;
        displayGameOver(data);
        return;
      }
      if (data.type === "room_update") {
        players = data.players;
        if (players.player1 === currentUser) myPaddle = "paddle_1";
        else if (players.player2 === currentUser) myPaddle = "paddle_2";
        updatePlayerNames();
      } else if (data.type === "update_paddle") {
        if (data.paddle === "paddle_1") {
          paddle1Pos = data.position;
        } else {
          paddle2Pos = data.position;
        }
      } else if (data.type === "game_update") {
        if (data.ball_x !== undefined) ballPos.x = data.ball_x;
        if (data.ball_y !== undefined) ballPos.y = data.ball_y;
        if (data.score1 !== undefined && data.score2 !== undefined) {
          updateScore(data.score1, data.score2);
        }
      }
    } catch (err) {
      console.error("Error Pong WS parse:", err);
    }
  };

  // Listener para mover palas
  document.addEventListener("keydown", onPongKeyDown);
}

function initPongCanvasLoop() {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const cw = canvas.width;
  const ch = canvas.height;

  const paddleWidth = 10;
  const paddleHeight = 80;
  const ballRadius = 10;

  function drawFrame() {
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cw, ch);

    // Palas
    const p1x = 0.05 * cw;
    const p1y = (paddle1Pos / 100) * ch - paddleHeight/2;
    ctx.fillStyle = "#fff";
    ctx.fillRect(p1x, p1y, paddleWidth, paddleHeight);

    const p2x = 0.95 * cw - paddleWidth;
    const p2y = (paddle2Pos / 100) * ch - paddleHeight/2;
    ctx.fillRect(p2x, p2y, paddleWidth, paddleHeight);

    // Bola
    const bx = (ballPos.x / 100) * cw;
    const by = (ballPos.y / 100) * ch;
    ctx.beginPath();
    ctx.arc(bx, by, ballRadius, 0, 2 * Math.PI);
    ctx.fill();
  }

  function loop() {
    if (!gameOver) {
      drawFrame();
      requestAnimationFrame(loop);
    }
  }
  loop();
}

function onPongKeyDown(e) {
  if (gameOver) return;
  let direction = 0;
  if (e.key === "ArrowUp") direction = -5;
  if (e.key === "ArrowDown") direction = 5;
  if (direction !== 0 && myPaddle && pongSocket) {
    const currentPos = (myPaddle === "paddle_1") ? paddle1Pos : paddle2Pos;
    pongSocket.send(JSON.stringify({
      type: "move_paddle",
      username: getUsername(),
      direction,
      position: currentPos
    }));
  }
}

function updatePlayerNames() {
  document.getElementById("leftPlayerName").textContent = players.player1 || "Jugador 1";
  document.getElementById("rightPlayerName").textContent = players.player2 || "Jugador 2";
}

function updateScore(s1, s2) {
  document.getElementById("leftScore").textContent = s1;
  document.getElementById("rightScore").textContent = s2;
}

function startCountdown(roomId) {
  let count = 3;
  const cdEl = document.getElementById("countdown");
  cdEl.textContent = count;

  const intervalId = setInterval(() => {
    count--;
    if (count > 0) {
      cdEl.textContent = count;
    } else {
      cdEl.textContent = "¡GO!";
      clearInterval(intervalId);
      setTimeout(() => {
        cdEl.textContent = "";
        // Avisar al server que inicie el juego
        if (pongSocket) {
          pongSocket.send(JSON.stringify({ type: "start_game", room: roomId }));
        }
      }, 500);
    }
  }, 1000);
}

/****************************************************
 * 6) DISPLAY GAME OVER
 ****************************************************/
function displayGameOver(gameData) {
  console.log("==> GAME OVER DATA:", gameData);

  gameOver = true;
  document.removeEventListener("keydown", onPongKeyDown);

  let winner = gameData.winner || "Desconocido";
  let resultMessage = "Has perdido";
  if (getUsername() === winner) {
    resultMessage = "¡Has ganado!";
  }

  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
  overlay.style.display = "flex";
  overlay.style.flexDirection = "column";
  overlay.style.justifyContent = "center";
  overlay.style.alignItems = "center";
  overlay.style.zIndex = 9999;

  const h2 = document.createElement("h2");
  h2.style.color = "#fff";
  h2.textContent = resultMessage;
  overlay.appendChild(h2);

  const p = document.createElement("p");
  p.style.color = "#fff";
  p.style.fontSize = "24px";
  p.textContent = `Ganador: ${winner} | ${gameData.score1} - ${gameData.score2}`;
  overlay.appendChild(p);

  const btn = document.createElement("button");
  btn.className = "btn btn-primary mt-3";
  btn.textContent = "Volver al Home";
  btn.onclick = () => {
    document.body.removeChild(overlay);
    window.location.hash = "#home";
  };
  overlay.appendChild(btn);

  document.body.appendChild(overlay);
}
