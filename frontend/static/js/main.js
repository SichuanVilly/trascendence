/* 
  main.js
  - Router con 2 websockets distintos, uno para #home (usuarios), otro para #pong (partida).
  - Cada vez que cambias de vista, cierras el WS anterior y abres el de la vista actual.
*/

/****************************************************
 * 1) VAR GLOBALES Y UTILIDADES: TOKEN, WS, etc.
 ****************************************************/

// Si el hostname es "localhost", usamos localhost; de lo contrario, usamos el hostname actual y configuramos el puerto
const API_BASE_URL = window.location.hostname === "localhost" 
  ? "http://localhost:8000" 
  : "http://" + window.location.hostname + ":8000";

const WS_BASE_URL = window.location.hostname === "localhost" 
  ? "ws://localhost:8000" 
  : "ws://" + window.location.hostname + ":8000";

let userSocket = null;      // WS para usuarios online
let pongSocket = null;      // WS para la partida
let globalOnlineUsers = []; // Lista global de usuarios online
let currentFriendsViewContext = "chat"; // Contexto actual de la vista de amigos ("chat" o "friends")
let globalBlockedUsers = [];
let chatHistoryIntervalId = null;

// Define globalmente los listeners para el torneo
window.tournamentHandleKeyDown = function(e) {
  if (e.repeat) return;
  if (!window.tournamentLocalSocket) return; // Si no existe, no hace nada
  let message = null;
  if (e.code === "KeyW") {
    message = { type: "paddle_input", paddle: "left", speed: -3 };
  } else if (e.code === "KeyS") {
    message = { type: "paddle_input", paddle: "left", speed: 3 };
  } else if (e.code === "ArrowUp") {
    message = { type: "paddle_input", paddle: "right", speed: -3 };
  } else if (e.code === "ArrowDown") {
    message = { type: "paddle_input", paddle: "right", speed: 3 };
  }
  if (message && window.tournamentLocalSocket.readyState === WebSocket.OPEN) {
    window.tournamentLocalSocket.send(JSON.stringify(message));
  }
};

window.tournamentHandleKeyUp = function(e) {
  if (!window.tournamentLocalSocket) return;
  let message = null;
  if (e.code === "KeyW" || e.code === "KeyS") {
    message = { type: "paddle_input", paddle: "left", speed: 0 };
  } else if (e.code === "ArrowUp" || e.code === "ArrowDown") {
    message = { type: "paddle_input", paddle: "right", speed: 0 };
  }
  if (message && window.tournamentLocalSocket.readyState === WebSocket.OPEN) {
    window.tournamentLocalSocket.send(JSON.stringify(message));
  }
};


document.addEventListener('keydown', function(event) {
  // keyCode 37: flecha izquierda, 38: flecha arriba, 39: flecha derecha, 40: flecha abajo
  if ([37, 38, 39, 40].indexOf(event.keyCode) > -1) {
    event.preventDefault();
  }
});

function setToken(username, token) {
  localStorage.setItem(`access_token_${username}`, token);
}

function getToken(username) {
  return localStorage.getItem(`access_token_${username}`);
}


function setRefreshToken(token) {
  localStorage.setItem("refresh_token", token);
}

function getRefreshToken() {
  return localStorage.getItem("refresh_token");
}

function clearToken() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

function setUsername(username) {
  localStorage.setItem("username", username);
}

function getUsername() {
  return localStorage.getItem("username");
}

function clearUsername() {
  localStorage.removeItem("username");
}


// Extraer parámetros después de "#pong?room=..."
function getHashQueryParam(param) {
  const hash = window.location.hash.replace("#", "");
  const queryIndex = hash.indexOf("?");
  if (queryIndex < 0) return null;
  const queryString = hash.slice(queryIndex + 1);
  const urlParams = new URLSearchParams(queryString);
  return urlParams.get(param);
}

/****************************************************
 * FUNCIONES ADICIONALES PARA CIERRE DE WS
 ****************************************************/
function closeHomeWS() {
  if (userSocket && userSocket.readyState === WebSocket.OPEN) {
    console.log("Cerrando userSocket (Home)...");
    userSocket.close();
  }
  userSocket = null;
}

function closePongWS() {
  if (pongSocket && pongSocket.readyState === WebSocket.OPEN) {
    console.log("Cerrando pongSocket...");
    pongSocket.close();
  }
  pongSocket = null;
}

/****************************************************
 * FUNCION: updateNavbarVisibility
 ****************************************************/
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

/****************************************************
 * 2) LAYOUT BASE: SIDEBAR FIJO Y CONTENIDO DINÁMICO
 ****************************************************/
function renderLayout(contentHtml) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="container-fluid" style="min-height: 100vh;">
      <div class="row h-100">
        <!-- Sidebar -->
        <div class="col-12 col-md-3 col-lg-2 bg-dark text-white p-3">
          <h3 class="mb-4">Transcendence</h3>
          <ul class="nav flex-column">
            <li class="nav-item mb-2">
              <a class="nav-link text-white" href="#home">Home</a>
            </li>
            <li class="nav-item mb-2">
              <a class="nav-link text-white" href="#friends">Friends</a>
            </li>
            <li class="nav-item mb-2">
              <a class="nav-link text-white" data-bs-toggle="collapse" href="#gameSubmenu" role="button" aria-expanded="false" aria-controls="gameSubmenu">
                Game
              </a>
              <div class="collapse" id="gameSubmenu">
                <ul class="nav flex-column ms-3 mt-2">
                  <li class="nav-item">
                    <a class="nav-link text-white" href="#game-ia">IA</a>
                  </li>
                  <li class="nav-item">
                    <a class="nav-link text-white" href="#game-local">Local</a>
                  </li>
                </ul>
              </div>
            </li>
            <li class="nav-item mb-2">
              <a class="nav-link text-white" href="#chat">Chat</a>
            </li>
            <li class="nav-item mb-2">
              <a class="nav-link text-white" href="#tournament">Tournament</a>
            </li>
            <li class="nav-item mb-2">
              <a class="nav-link text-white" href="#settings">Settings</a>
            </li>
            <li class="nav-item mb-2">
              <a class="nav-link text-white" href="#logout">Logout</a>
            </li>
          </ul>
        </div>
        <!-- Contenido Dinámico -->
        <div class="col-12 col-md-9 col-lg-10 p-4" id="mainContent">
          ${contentHtml}
        </div>
      </div>
    </div>
  `;
}

/****************************************************
 * 3) ARRANQUE Y ROUTER
 ****************************************************/
window.addEventListener("load", () => {
  if (!window.location.hash) {
    if (getToken()) window.location.hash = "#home";
    else window.location.hash = "#login";
  }
  router();
});
window.addEventListener("hashchange", router);

function getHashQueryParam(param) {
  const hash = window.location.hash.replace("#", "");
  const queryIndex = hash.indexOf("?");
  if (queryIndex < 0) return null;
  const queryString = hash.slice(queryIndex + 1);
  const urlParams = new URLSearchParams(queryString);
  return urlParams.get(param);
}

function getHashQueryParams() {
  const hash = window.location.hash.replace("#", "");
  const queryIndex = hash.indexOf("?");
  if (queryIndex < 0) return {};
  const queryString = hash.slice(queryIndex + 1);
  const urlParams = new URLSearchParams(queryString);
  const params = {};
  for (const [key, value] of urlParams.entries()) {
    params[key] = value;
  }
  return params;
}

function router() {
  const hash = window.location.hash.replace("#", "");
  const usernametoken = getUsername();
  const token = usernametoken ? getToken(usernametoken) : null;

  cleanupTournamentSocket();
  updateNavbarVisibility(!!token);

  // Cierra el WS de Pong online, si existe
  closePongWS();

  // Si la vista actual NO es "game-local", se limpia la vista local
  if (!hash.startsWith("game-local") && typeof window.cleanupLocalGameView === "function") {
    window.cleanupLocalGameView();
  }

  // No cerramos el WS de usuarios (userSocket) si se mantiene abierto globalmente.
  if (token && window.location.hash !== "#login" && window.location.hash !== "#register") {
    if (!userSocket || userSocket.readyState !== WebSocket.OPEN) {
      initUsersWebSocket();
    }
  }

  if (!token && hash !== "login" && hash !== "register") {
    window.location.hash = "#login";
    return;
  }

  // Activar polling solo en friends y chat
  if (hash.startsWith("friends") || hash.startsWith("chat")) {
    startPollingFriendsList();
  } else {
    stopPollingFriendsList();
  }

  if (hash.startsWith("pong")) {
    const roomId = getHashQueryParam("room");
    renderPongView(roomId);
    return;
  }

  if (hash.startsWith("chat")) {
    const params = getHashQueryParams();
    if (params.friend) {
      renderPrivateChatView(params.friend);
      return;
    } else {
      renderChatView();
      return;
    }
  }


  switch (hash) {
    case "login":
      renderLoginView();
      break;
    case "register":
      renderRegisterView();
      break;
    case "home":
      renderHomeView();
      break;
    case "friends":
      renderFriendsView();
      break;
    case "game-ia":
      renderGameIaView();
      break;
    case "game-local":
      renderGameLocalView();
      break;
    case "tournament":
      renderTournamentView();
      break;
    case "settings":
      renderSettingsView();
      break;
    case "logout":
      logout();
      break;
    default:
      window.location.hash = token ? "#home" : "#login";
  }
}



function logout() {
  //clearToken();
  clearUsername();
  closeHomeWS();
  closePongWS();
  cleanupTournamentSocket();
  stopPollingFriendsList();
  window.location.hash = "#login";
}

/****************************************************
 * 4) VISTAS DINÁMICAS (Contenido central)
 ****************************************************/

// Vista Home
function renderHomeView() {
  const user = getUsername() || "Desconocido";
  const contentHtml = `
    <h1>¡Bienvenido, ${user}!</h1>
    <p>Esta es tu pantalla de inicio. Selecciona alguna opción en el menú lateral.</p>
  `;
  renderLayout(contentHtml);
}

function updateFriendsList(friends, viewContext = "friends") {
  const friendsListContainer = document.getElementById("friendsListContainer");
  if (!friendsListContainer) return;
  let html = "";
  if (friends && friends.length > 0) {
    html = `<ul class="list-group">` +
      friends.map(friend => {
        const isOnline = globalOnlineUsers.includes(friend.username);
        const statusHTML = `<span style="color: ${isOnline ? 'green' : 'red'}; font-weight: bold; margin-left: 10px;">${isOnline ? 'Online' : 'Offline'}</span>`;
        let avatarPath = friend.avatar ? friend.avatar : 'avatars/default_avatar.png';
        if (avatarPath.startsWith('/media/')) {
          avatarPath = avatarPath.slice(7);
        }
        const fullAvatarUrl = avatarPath.startsWith('http')
          ? avatarPath
          : `${API_BASE_URL}/media/${avatarPath}`;

        let buttonHTML = "";
        if (viewContext === "friends") {
          buttonHTML = `<button class="btn btn-sm btn-danger action-friend-btn" data-friend="${friend.username}" data-action="remove">Remove</button>`;
        } else if (viewContext === "chat") {
          if (globalBlockedUsers.includes(friend.username)) {
            buttonHTML = `<button class="btn btn-sm btn-secondary action-friend-btn" data-friend="${friend.username}" data-action="unblock">Unblock</button>`;
          } else {
            const playButtonHTML = `<button class="btn btn-sm btn-success action-friend-btn" data-friend="${friend.username}" data-action="play">Play</button>`;
            const chatButtonHTML = `<button class="btn btn-sm btn-primary action-friend-btn" data-friend="${friend.username}" data-action="chat">Chat</button>`;
            const blockButtonHTML = `<button class="btn btn-sm btn-warning action-friend-btn" data-friend="${friend.username}" data-action="block">Block</button>`;
            buttonHTML = playButtonHTML + " " + chatButtonHTML + " " + blockButtonHTML;
          }
        }

        return `
          <li class="list-group-item d-flex justify-content-between align-items-center">
            <div>
              <img src="${fullAvatarUrl}" alt="Avatar" style="width:30px; height:30px; border-radius:50%; margin-right:10px;">
              <a href="#" onclick="renderUserProfileView('${friend.username}'); return false;">${friend.username}</a>
              ${statusHTML}
            </div>
            <div>
              ${buttonHTML}
            </div>
          </li>`;
      }).join("") +
      `</ul>`;
  } else {
    html = `<p>No tienes amigos añadidos.</p>`;
  }
  friendsListContainer.innerHTML = html;

  const actionButtons = document.querySelectorAll(".action-friend-btn");
  actionButtons.forEach(btn => {
    btn.addEventListener("click", function() {
      const friendName = this.getAttribute("data-friend");
      const action = this.getAttribute("data-action");
      if (action === "remove") {
        removeFriend(friendName);
      } else if (action === "play") {
        inviteUser(friendName, getUsername());
      } else if (action === "chat") {
        window.location.hash = `chat?friend=${friendName}`;
      } else if (action === "block") {
        if (confirm(`¿Estás seguro de bloquear a ${friendName}?`)) {
          blockFriend(friendName);
        }
      } else if (action === "unblock") {
        if (confirm(`¿Deseas desbloquear a ${friendName}?`)) {
          unblockFriend(friendName);
        }
      }
    });
  });
}


function blockFriend(friendName) {

  const usernametoken = getUsername();
  const token = usernametoken ? getToken(usernametoken) : null;
  fetch(`${API_BASE_URL}/api/users/block-friend/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    body: JSON.stringify({ friend: friendName })
  })
    .then(resp => {
      if (!resp.ok) {
        return resp.json().then(errData => { throw errData; });
      }
      return resp.json();
    })
    .then(result => {
      alert(result.message);
      // Redirige a la vista de chat y recarga la página
      window.location.hash = "#chat";
      location.reload();
    })
    .catch(err => {
      console.error("Error blocking friend:", err);
      alert("Error al bloquear al amigo: " + (err.error || "Error desconocido."));
    });
}


function unblockFriend(friendName) {

  const usernametoken = getUsername();
  const token = usernametoken ? getToken(usernametoken) : null;

  fetch(`${API_BASE_URL}/api/users/unblock-friend/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    body: JSON.stringify({ friend: friendName })
  })
    .then(resp => {
      if (!resp.ok) {
        return resp.json().then(errData => { throw errData; });
      }
      return resp.json();
    })
    .then(result => {
      alert(result.message);
      renderChatView();
    })
    .catch(err => {
      console.error("Error unblocking friend:", err);
      alert("Error al desbloquear al amigo: " + (err.error || "Error desconocido."));
    });
}

function removeFriend(friendToRemove) {
  const usernametoken = getUsername();
  const token = usernametoken ? getToken(usernametoken) : null;

  fetch(`${API_BASE_URL}/api/users/remove-friend/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    body: JSON.stringify({ friend: friendToRemove })
  })
  .then(resp => {
    if (!resp.ok) {
      return resp.json().then(errData => { throw errData; });
    }
    return resp.json();
  })
  .then(result => {
    alert(result.message);
    renderFriendsView(); // O actualizar solo la lista llamando a updateFriendsList(result.friends) si el endpoint lo retorna.
  })
  .catch(err => {
    console.error("Error removing friend:", err);
    alert("Error al eliminar amigo: " + (err.error || "Error desconocido."));
  });
}

function renderFriendsView() {
  const usernametoken = getUsername();
  const token = usernametoken ? getToken(usernametoken) : null;
  const currentUser = getUsername();
  // Establecemos el contexto "friends"
  currentFriendsViewContext = "friends";
  
  fetch(`${API_BASE_URL}/api/users/detail/`, {
    headers: { "Authorization": "Bearer " + token }
  })
    .then(response => response.json())
    .then(data => {
      console.log("User data:", data);
      const contentHtml = `
        <h2>Friends</h2>
        <div class="mb-3">
          <label for="friendUsernameInput" class="form-label">Nombre de Usuario:</label>
          <input type="text" id="friendUsernameInput" class="form-control" placeholder="Escribe el nombre del amigo">
        </div>
        <button id="addFriendBtn" class="btn btn-primary mb-4">Add Friend</button>
        <h3>Lista de Amigos:</h3>
        <div id="friendsListContainer">
          <!-- Aquí se inyectará la lista de amigos -->
        </div>
      `;
      renderLayout(contentHtml);
  
      // Actualizamos la lista de amigos con el botón "Remove"
      updateFriendsList(data.friends, "friends");
  
      document.getElementById("addFriendBtn").addEventListener("click", () => {
        const friendName = document.getElementById("friendUsernameInput").value.trim();
        if (!friendName) {
          alert("Por favor, ingresa un nombre de usuario.");
          return;
        }
        if (friendName === currentUser) {
          alert("No te puedes agregar a ti mismo.");
          return;
        }
        fetch(`${API_BASE_URL}/api/users/add-friend/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
          },
          body: JSON.stringify({ friend: friendName })
        })
          .then(resp => {
            if (!resp.ok) {
              return resp.json().then(errData => { throw errData; });
            }
            return resp.json();
          })
          .then(result => {
            alert(result.message);
            renderFriendsView(); // Re-renderiza para actualizar la lista.
          })
          .catch(err => {
            console.error("Error adding friend:", err);
            alert("Error al añadir amigo: " + (err.error || "Error desconocido."));
          });
      });
    })
    .catch(err => {
      console.error("Error fetching user details:", err);
      alert("Error al obtener datos del usuario.");
    });
}

/****************************************************
 * Funciones para la Vista Chat y Chat Privado
 ****************************************************/


function renderChatView() {
  const usernametoken = getUsername();
  const token = usernametoken ? getToken(usernametoken) : null;
  fetch(`${API_BASE_URL}/api/users/detail/`, {
    headers: { "Authorization": "Bearer " + token }
  })
    .then(response => response.json())
    .then(data => {
      console.log("User data:", data);
      // Actualizamos la lista global de bloqueados (si se usa en los botones, etc.)
      globalBlockedUsers = data.blocked_friends.map(f => f.username);
      const contentHtml = `
        <h2>Chat</h2>
        <div class="row">
          <!-- Columna Izquierda: Lista de Amigos -->
          <div class="col-12 col-md-3">
            <h5>Friends Online</h5>
            <div id="friendsListContainer"></div>
          </div>
          <!-- Columna Derecha: Ventana del chat -->
          <div class="col-12 col-md-9" id="chatContainer">
            <p>Selecciona un amigo para chatear.</p>
          </div>
        </div>
      `;
      renderLayout(contentHtml);
      // En la vista general de chat, no queremos que esté activo el intervalo del historial de chat privado
      if (chatHistoryIntervalId) {
        clearInterval(chatHistoryIntervalId);
        chatHistoryIntervalId = null;
      }
      currentFriendsViewContext = "chat";
      updateFriendsList(data.friends, "chat");
    })
    .catch(err => {
      console.error("Error fetching user details:", err);
      alert("Error al obtener datos del usuario.");
    });
}

function renderPrivateChatView(friendUsername) {
  const usernametoken = getUsername();
  const token = usernametoken ? getToken(usernametoken) : null;
  // Define el HTML de la ventana de chat privado
  const chatHtml = `
    <h2>Chat con ${friendUsername}</h2>
    <div id="chatHistory" style="border:1px solid #ccc; height:400px; overflow-y:scroll; padding:10px; background:#fff;">
      <!-- Historial de mensajes -->
    </div>
    <div style="margin-top:10px;">
      <input type="text" id="chatMessageInput" class="form-control" placeholder="Escribe tu mensaje">
      <button id="sendChatMessageBtn" class="btn btn-primary mt-2">Enviar</button>
    </div>
  `;
  // Sólo actualizamos la columna derecha, dejando intacta la lista de amigos (columna izquierda)
  const chatContainer = document.getElementById("chatContainer");
  if (chatContainer) {
    chatContainer.innerHTML = chatHtml;
  }
  // Si ya existe un interval para el historial de chat privado, lo limpiamos
  if (chatHistoryIntervalId) {
    clearInterval(chatHistoryIntervalId);
    chatHistoryIntervalId = null;
  }
  
  // Función para cargar el historial de chat
  function loadChatHistory() {
    fetch(`${API_BASE_URL}/api/chat/conversation/?friend=${friendUsername}`, {
      headers: { "Authorization": "Bearer " + token }
    })
      .then(response => response.json())
      .then(data => {
        const chatHistoryDiv = document.getElementById("chatHistory");
        if (data.messages && data.messages.length > 0) {
          // Mostramos cada mensaje sin fecha
          chatHistoryDiv.innerHTML = data.messages.map(msg => {
            return `<div style="margin-bottom:5px;">
                      <strong>${msg.sender}:</strong> ${msg.text}
                    </div>`;
          }).join("");
        } else {
          chatHistoryDiv.innerHTML = "<p>No hay mensajes.</p>";
        }
        // Auto-scroll al final
        chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;
      })
      .catch(err => console.error("Error loading chat history:", err));
  }
  
  // Cargar el historial de chat inmediatamente
  loadChatHistory();
  
  // Iniciar el polling del historial de chat cada 1 segundo y guardar el ID del interval
  chatHistoryIntervalId = setInterval(loadChatHistory, 1000);
  
  // Evento para enviar mensaje
  document.getElementById("sendChatMessageBtn").addEventListener("click", () => {
    const messageText = document.getElementById("chatMessageInput").value.trim();
    if (!messageText) return;
    fetch(`${API_BASE_URL}/api/chat/send/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({ friend: friendUsername, text: messageText })
    })
      .then(response => response.json())
      .then(data => {
        document.getElementById("chatMessageInput").value = "";
        loadChatHistory(); // Recargar historial tras enviar mensaje
      })
      .catch(err => console.error("Error sending message:", err));
  });
}



function renderSettingsView() {

  const usernametoken = getUsername();
  const token = usernametoken ? getToken(usernametoken) : null;

  fetch(`${API_BASE_URL}/api/users/detail/`, {
    headers: { "Authorization": "Bearer " + token }
  })
    .then(response => response.json())
    .then(data => {
      console.log("User data:", data);
      let avatarPath = data.avatar ? data.avatar : 'avatars/default_avatar.png';
      if (avatarPath.startsWith('/media/')) {
        avatarPath = avatarPath.slice(1);
      }
      const avatarUrl = avatarPath.startsWith('http')
        ? avatarPath
        : `${API_BASE_URL}/${avatarPath}`;

      const contentHtml = `
        <h2 class="mt-4">Configuración de Usuario</h2>
        <div class="text-center my-4">
          <img id="avatarImg" src="${avatarUrl}" alt="Avatar" style="width:150px; height:150px; border-radius:50%; cursor:pointer;">
          <input type="file" id="avatarInput" style="display: none;" accept="image/*">
        </div>
        <div class="mb-3">
          <label for="usernameInput" class="form-label">Nombre de Usuario:</label>
          <input type="text" class="form-control" id="usernameInput" value="${data.username}">
        </div>
        <div class="mb-3">
          <label class="form-label">Correo electrónico:</label>
          <p id="emailDisplay" class="form-control-plaintext">${data.email}</p>
        </div>
        <div class="mb-3">
          <p>Victorias: <span id="winsCount">${data.wins ?? 0}</span></p>
          <p>Derrotas: <span id="lossesCount">${data.losses ?? 0}</span></p>
        </div>
        <!-- Gráfica circular para victorias y derrotas -->
        <div class="chart-container mb-4" style="width:300px; margin: auto;">
          <canvas id="winLossChart"></canvas>
        </div>
        <h4 class="mt-4">Últimas partidas</h4>
        <div id="matchHistory" class="mb-4">Cargando historial...</div>
        <button class="btn btn-primary" id="saveSettingsBtn">Guardar cambios</button>
        <button class="btn btn-danger mt-2" id="deleteUserBtn">Borrar Usuario</button>
      `;

      renderLayout(contentHtml);

      // Eventos de imagen y subida
      document.getElementById("avatarImg").addEventListener("click", () => {
        document.getElementById("avatarInput").click();
      });
      document.getElementById("avatarInput").addEventListener("change", function () {
        const file = this.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = function (e) {
            document.getElementById("avatarImg").src = e.target.result;
          };
          reader.readAsDataURL(file);
        }
      });

      // Inicializar la gráfica circular usando Chart.js
      const wins = parseInt(document.getElementById("winsCount").innerText);
      const losses = parseInt(document.getElementById("lossesCount").innerText);
      let chartData, chartLabels, chartColors;
      if (wins + losses > 0) {
        const total = wins + losses;
        const winsPercentage = Math.round((wins / total) * 100);
        const lossesPercentage = 100 - winsPercentage;
        chartData = [wins, losses];
        chartLabels = [`Victorias ${winsPercentage}%`, `Derrotas ${lossesPercentage}%`];
        chartColors = ["#28a745", "#dc3545"];
      } else {
        chartData = [1];
        chartLabels = ["No data"];
        chartColors = ["#6c757d"];
      }
      const ctx = document.getElementById("winLossChart").getContext("2d");
      new Chart(ctx, {
        type: "pie",
        data: {
          labels: chartLabels,
          datasets: [{
            data: chartData,
            backgroundColor: chartColors,
          }]
        },
        options: {
          plugins: {
            legend: {
              position: "bottom"
            }
          }
        }
      });

      // Guardar cambios (solo permite actualizar el nombre y la foto)
      document.getElementById("saveSettingsBtn").addEventListener("click", () => {
        const formData = new FormData();
        const newUsername = document.getElementById("usernameInput").value;
        formData.append("username", newUsername);
        const avatarFile = document.getElementById("avatarInput").files[0];
        if (avatarFile) {
          formData.append("avatar", avatarFile);
        }
        fetch(`${API_BASE_URL}/api/users/update/`, {
          method: "PATCH",
          headers: { "Authorization": "Bearer " + token },
          body: formData
        })
          .then(resp => {
            if (!resp.ok) return resp.json().then(errData => { throw errData; });
            return resp.json();
          })
          .then(updatedData => {
            alert("Datos actualizados exitosamente.");
            setUsername(updatedData.username);
            renderSettingsView();
          })
          .catch(err => {
            console.error("Error actualizando datos:", err);
            alert("Error al actualizar los datos.");
          });
      });

      // Borrar cuenta
      document.getElementById("deleteUserBtn").addEventListener("click", () => {
        if (confirm("¿Estás seguro de que deseas borrar tu cuenta? Esta acción no se puede deshacer.")) {
          fetch(`${API_BASE_URL}/api/users/delete/`, {
            method: "DELETE",
            headers: { "Authorization": "Bearer " + token }
          })
            .then(resp => {
              if (!resp.ok) return resp.json().then(errData => { throw errData; });
              return resp.json();
            })
            .then(() => {
              alert("Cuenta eliminada exitosamente.");
              logout();
            })
            .catch(err => {
              console.error("Error eliminando usuario:", err);
              alert("Error al eliminar la cuenta.");
            });
        }
      });

      // Cargar historial de partidas
      fetch(`${API_BASE_URL}/api/users/match_history/`, {
        headers: { "Authorization": "Bearer " + token }
      })
        .then(res => res.json())
        .then(matches => {
          const container = document.getElementById("matchHistory");
          if (!matches.length) {
            container.innerHTML = "<p>No hay partidas registradas.</p>";
            return;
          }
          container.style.maxHeight = "300px";
          container.style.overflowY = "auto";
          container.style.border = "1px solid #ccc";
          container.style.padding = "10px";
          container.style.borderRadius = "6px";
          container.style.backgroundColor = "#f8f9fa";

          container.innerHTML = matches.map(m => `
            <div class="card mb-2">
              <div class="card-body p-2">
                <strong>${m.player1}</strong> ${m.score1} - ${m.score2} <strong>${m.player2}</strong><br>
                <small class="text-muted">Ganador: ${m.winner} | ${new Date(m.played_at).toLocaleString()}</small>
              </div>
            </div>
          `).join("");
        })
        .catch(err => {
          document.getElementById("matchHistory").innerHTML = "<p>Error al cargar el historial.</p>";
          console.error("Historial partidas:", err);
        });
    })
    .catch(err => {
      console.error("Error fetching user details:", err);
    });
}


function renderUserProfileView(username) {
  const usernameyoken = getUsername();
  const token = usernameyoken ? getToken(usernameyoken) : null;
  // Se asume que este endpoint está definido en el backend y retorna datos públicos del usuario
  fetch(`${API_BASE_URL}/api/users/profile/${username}/`, {
    headers: { "Authorization": "Bearer " + token }
  })
    .then(response => {
      if (!response.ok) {
        throw new Error("HTTP error " + response.status);
      }
      return response.json();
    })
    .then(data => {
      console.log("Perfil del usuario:", data);
      let avatarPath = data.avatar ? data.avatar : 'avatars/default_avatar.png';
      if (avatarPath.startsWith('/media/')) {
        avatarPath = avatarPath.slice(1);
      }
      const avatarUrl = avatarPath.startsWith('http')
        ? avatarPath
        : `${API_BASE_URL}/${avatarPath}`;

      const contentHtml = `
        <h2 class="mt-4">Perfil de Usuario</h2>
        <div class="text-center my-4">
          <img src="${avatarUrl}" alt="Avatar de ${data.username}" style="width:150px; height:150px; border-radius:50%;">
        </div>
        <div class="mb-3">
          <p><strong>Nombre de Usuario:</strong> ${data.username}</p>
        </div>
        <div class="mb-3">
          <p><strong>Victorias:</strong> <span id="winsCount">${data.wins ?? 0}</span></p>
          <p><strong>Derrotas:</strong> <span id="lossesCount">${data.losses ?? 0}</span></p>
        </div>
        <!-- Gráfica circular para victorias y derrotas -->
        <div class="chart-container mb-4" style="width:300px; margin: auto;">
          <canvas id="winLossChart"></canvas>
        </div>
        <button class="btn btn-secondary" onclick="renderChatView()">Volver al Chat</button>
      `;

      renderLayout(contentHtml);

      // Inicializar la gráfica circular usando Chart.js
      const wins = parseInt(document.getElementById("winsCount").innerText);
      const losses = parseInt(document.getElementById("lossesCount").innerText);
      let chartData, chartLabels, chartColors;
      if (wins + losses > 0) {
        const total = wins + losses;
        const winsPercentage = Math.round((wins / total) * 100);
        const lossesPercentage = 100 - winsPercentage;
        chartData = [wins, losses];
        chartLabels = [`Victorias ${winsPercentage}%`, `Derrotas ${lossesPercentage}%`];
        chartColors = ["#28a745", "#dc3545"];
      } else {
        chartData = [1];
        chartLabels = ["No data"];
        chartColors = ["#6c757d"];
      }
      const ctx = document.getElementById("winLossChart").getContext("2d");
      new Chart(ctx, {
        type: "pie",
        data: {
          labels: chartLabels,
          datasets: [{
            data: chartData,
            backgroundColor: chartColors,
          }]
        },
        options: {
          plugins: {
            legend: {
              position: "bottom"
            }
          }
        }
      });
    })
    .catch(err => {
      console.error("Error fetching user profile:", err);
      alert("Error al obtener el perfil del usuario.");
    });
}







// -------------------------------
// VISTA DE JUEGO CONTRA IA
// -------------------------------
function renderGameIaView() {
  // 1) Cerrar websocket de Pong si estaba abierto
  closePongWS();

  // 2) Generar layout + canvas en el DOM
  const contentHtml = `
    <div class="text-center">
      <h2>Pong vs IA</h2>
      <canvas id="gameCanvasIa" width="800" height="400"></canvas>
      <div class="mt-2 d-flex justify-content-between" style="max-width: 800px; margin: 0 auto;">
        <div id="iaLeftScore">0</div>
        <div id="iaRightScore">0</div>
      </div>
      <p id="iaCountdown" style="font-size:1.5rem; margin-top:10px;"></p>
    </div>
  `;
  renderLayout(contentHtml);

  // 3) Variables globales para la partida
  window.iaGameOver = false;
  window.iaPaddleLeft = 50;
  window.iaPaddleRight = 50; 
  window.iaBallPos = { x: 50, y: 50 };

  // 4) Generamos un roomId aleatorio (o puedes usar algo fijo)
  const randomRoomId = Math.floor(Math.random() * 10000);

  // 5) Inicializar WebSocket y el loop de dibujo
  initPongAiWebSocket(randomRoomId);
  initPongAiCanvasLoop();

  // 6) Cuenta atrás
  startIaCountdown(randomRoomId);
}

/**
 * Inicializa el WebSocket para el modo IA.
 */
function initPongAiWebSocket(roomId) {
  const usernametoken = getUsername();
  const token = usernametoken ? getToken(usernametoken) : null;
  if (!token) {
    window.location.hash = "#login";
    return;
  }

  const wsUrl = `${WS_BASE_URL}/ws/pong_ai/${roomId}/?token=${token}`;
  console.log("Abriendo WS IA:", wsUrl);
  pongSocket = new WebSocket(wsUrl);

  pongSocket.onopen = () => console.log("WS Pong IA abierto");
  pongSocket.onclose = (e) => console.log("WS Pong IA cerrado", e);

  pongSocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === "initial_state") {
        // Estado inicial: centro de palas y pos. pelota
        iaPaddleLeft = data.paddle_left;
        iaPaddleRight = data.paddle_right;
        iaBallPos.x = data.ball_x;
        iaBallPos.y = data.ball_y;
      }
      else if (data.type === "update_paddle") {
        // Actualiza UNA de las palas
        if (data.paddle === "left") {
          iaPaddleLeft = data.position;
        } else {
          iaPaddleRight = data.position;
        }
      }
      else if (data.type === "game_update") {
        // Actualiza pelota, marcador y palas si vienen en data
        if (data.ball_x !== undefined) iaBallPos.x = data.ball_x;
        if (data.ball_y !== undefined) iaBallPos.y = data.ball_y;
        if (data.score_left !== undefined && data.score_right !== undefined) {
          updateIaScore(data.score_left, data.score_right);
        }
        if (data.paddle_left !== undefined) iaPaddleLeft = data.paddle_left;
        if (data.paddle_right !== undefined) iaPaddleRight = data.paddle_right;
      }
      else if (data.type === "game_over") {
        iaGameOver = true;
        displayIaGameOver(data);
      }

    } catch (err) {
      console.error("Error parse WS IA:", err);
    }
  };

  // Escuchamos keydown y keyup para enviar "paddle_input"
  document.addEventListener("keydown", onPongIaKeyDown);
  document.addEventListener("keyup", onPongIaKeyUp);
}

/**
 * Envía "start_game" al servidor de forma “segura”, 
 * esperando a que el socket esté en OPEN si hace falta.
 */
function safeSendStartGame(roomId) {
  if (!pongSocket) return;

  if (pongSocket.readyState === WebSocket.OPEN) {
    console.log("Enviando start_game al servidor IA...");
    pongSocket.send(JSON.stringify({ type: "start_game", room: roomId }));
  } else {
    // Aún conectando => reintentamos en 100ms
    console.log("Socket IA no listo, reintento en 100ms...");
    setTimeout(() => safeSendStartGame(roomId), 100);
  }
}

/**
 * Inicia la cuenta atrás y al finalizar envía "start_game" 
 * usando la función de envío seguro para evitar errores de CONNECTING.
 */
function startIaCountdown(roomId) {
  let count = 3;
  const cdEl = document.getElementById("iaCountdown");
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
        // Llamamos a safeSendStartGame
        safeSendStartGame(roomId);
      }, 500);
    }
  }, 1000);
}

/**
 * Maneja keydown: si flecha arriba => speed=-3, abajo => speed=+3
 * Enviamos "paddle_input" al servidor.
 */
function onPongIaKeyDown(e) {
  if (iaGameOver) return;

  let speed = 0;
  if (e.key === "ArrowUp" || e.key === "w") {
    speed = -3; // subir
  } else if (e.key === "ArrowDown" || e.key === "s") {
    speed = 3;  // bajar
  }

  if (speed !== 0) {
    sendPaddleSpeed(speed);
  }
}

/**
 * Maneja keyup: si suelto flecha arriba/abajo => speed=0
 */
function onPongIaKeyUp(e) {
  if (iaGameOver) return;

  if (
    e.key === "ArrowUp" ||
    e.key === "ArrowDown" ||
    e.key === "w" ||
    e.key === "s"
  ) {
    sendPaddleSpeed(0);
  }
}

/**
 * Envía la velocidad deseada para la pala izquierda.
 */
function sendPaddleSpeed(speedValue) {
  if (!pongSocket) return;
  pongSocket.send(JSON.stringify({
    type: "paddle_input",
    speed: speedValue
  }));
}

/**
 * Bucle de dibujado en el canvas. 
 * Dado que en el backend la pala se maneja con "centro" en [0..100],
 * dibujamos restando la mitad de la altura.
 */
function initPongAiCanvasLoop() {
  const canvas = document.getElementById("gameCanvasIa");
  const ctx = canvas.getContext("2d");

  const cw = canvas.width;
  const ch = canvas.height;

  const paddleWidth = 10;
  const paddleHeight = 80; // en píxeles (aprox. 20% de 400)

  const ballRadius = 10;

  function drawFrame() {
    ctx.clearRect(0, 0, cw, ch);

    // Fondo
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cw, ch);

    // Pala izquierda (jugador)
    const p1CenterY = (iaPaddleLeft / 100) * ch;
    const p1TopY = p1CenterY - paddleHeight / 2;
    const p1x = 0.05 * cw;
    ctx.fillStyle = "#fff";
    ctx.fillRect(p1x, p1TopY, paddleWidth, paddleHeight);

    // Pala derecha (IA)
    const p2CenterY = (iaPaddleRight / 100) * ch;
    const p2TopY = p2CenterY - paddleHeight / 2;
    const p2x = 0.95 * cw - paddleWidth;
    ctx.fillRect(p2x, p2TopY, paddleWidth, paddleHeight);

    // Bola
    const bx = (iaBallPos.x / 100) * cw;
    const by = (iaBallPos.y / 100) * ch;
    ctx.beginPath();
    ctx.arc(bx, by, ballRadius, 0, 2 * Math.PI);
    ctx.fill();

    if (!iaGameOver) {
      requestAnimationFrame(drawFrame);
    }
  }

  drawFrame(); // Iniciar animación
}

/**
 * Actualizar marcador en pantalla
 */
function updateIaScore(scoreLeft, scoreRight) {
  const leftScoreEl = document.getElementById("iaLeftScore");
  const rightScoreEl = document.getElementById("iaRightScore");
  if (leftScoreEl) leftScoreEl.textContent = scoreLeft;
  if (rightScoreEl) rightScoreEl.textContent = scoreRight;
}

/**
 * Mostrar overlay al terminar la partida
 */
function displayIaGameOver(data) {
  iaGameOver = true;

  document.removeEventListener("keydown", onPongIaKeyDown);
  document.removeEventListener("keyup", onPongIaKeyUp);

  const winner = data.winner || "Desconocido";
  const scoreLeft = data.score_left ?? 0;
  const scoreRight = data.score_right ?? 0;
  const userIsWinner = (getUsername() === winner);

  let resultMessage = userIsWinner ? "¡Has ganado!" : "Has perdido";

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
  p.textContent = `Ganador: ${winner} | ${scoreLeft} - ${scoreRight}`;
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



function renderGameOnlineView() {
  const contentHtml = `<h2>Juego: Online</h2><p>Contenido para juego online.</p>`;
  renderLayout(contentHtml);
}

/****************************************************
 * LOGIN Y REGISTER (con verificación por username)
 ****************************************************/

function validateEmail(email) {
  const re = /\S+@\S+\.\S+/;
  return re.test(email);
}

// ---------------- REGISTRO ----------------

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
              <label for="email" class="form-label">Correo electrónico</label>
              <input type="email" class="form-control" id="email" required>
            </div>
            <div class="mb-3">
              <label for="password" class="form-label">Contraseña</label>
              <input type="password" class="form-control" id="password" required>
            </div>
            <button type="submit" class="btn btn-primary w-100">Registrarse</button>
          </form>
          <p class="text-center mt-3">¿Ya tienes cuenta? <a href="#login">Inicia sesión</a></p>
        </div>
      </div>
    </div>
  `;

  document.getElementById("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("username").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    if (!validateEmail(email)) {
      alert("Por favor, ingresa un correo electrónico válido.");
      return;
    }

    try {
      const resp = await fetch(`${API_BASE_URL}/api/users/register/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password })
      });
      const data = await resp.json();
      if (resp.ok) {
        alert("Registro exitoso. Se ha enviado un código de verificación.");
        renderVerificationView(username);
      } else {
        alert(data.error || "Error en el registro");
      }
    } catch (err) {
      console.error("Error register:", err);
      alert("Error en la conexión al servidor");
    }
  });
}

function renderVerificationView(username) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="row justify-content-center mt-5">
      <div class="col-md-4">
        <div class="card p-4 shadow">
          <h3 class="card-title text-center mb-3">Verificación de Cuenta</h3>
          <p class="text-center">Se ha enviado un código al correo de <strong>${username}</strong>.</p>
          <form id="verificationForm">
            <div class="mb-3">
              <label for="verificationCode" class="form-label">Código de verificación</label>
              <input type="text" class="form-control" id="verificationCode" required>
            </div>
            <button type="submit" class="btn btn-primary w-100">Verificar</button>
          </form>
        </div>
      </div>
    </div>
  `;

  document.getElementById("verificationForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = document.getElementById("verificationCode").value.trim();

    try {
      const resp = await fetch(`${API_BASE_URL}/api/users/verify/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, code })
      });
      const data = await resp.json();
      if (resp.ok) {
        setToken(username, data.access);
        setRefreshToken(data.refresh);
        setUsername(data.user.username);
        alert("¡Cuenta verificada! Bienvenido.");
        window.location.hash = "#home";
      } else {
        alert(data.error || "Código incorrecto.");
      }
    } catch (err) {
      console.error("Error verificación:", err);
      alert("Error al conectar con el servidor.");
    }
  });
}

// ---------------- LOGIN ----------------

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
          <p class="text-center mt-3">¿No tienes cuenta? <a href="#register">Regístrate</a></p>
        </div>
      </div>
    </div>
  `;

  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    const payload = { username, password };
    const existingToken = getToken(username);

    if (!existingToken || existingToken.length < 10) {
      payload.force_verification = true;
    }

    try {
      const resp = await fetch(`${API_BASE_URL}/api/users/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await resp.json();

      if (resp.ok) {
        if (!data.access || !data.refresh) {
          alert("Faltan los tokens de acceso");
          return;
        }
        setToken(username, data.access);
        setRefreshToken(data.refresh);
        setUsername(data.user?.username || username);
        window.location.hash = "#home";
      } else if (resp.status === 403 && data.user?.username) {
        alert(data.error);
        renderLoginVerificationView(data.user.username);
      } else {
        alert(data.error || "Error al iniciar sesión.");
      }
    } catch (err) {
      console.error("Error login:", err);
      alert("Error en la conexión al servidor");
    }
  });
}

function renderLoginVerificationView(username) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="row justify-content-center mt-5">
      <div class="col-md-4">
        <div class="card p-4 shadow">
          <h3 class="card-title text-center mb-3">Verificación de Inicio de Sesión</h3>
          <p class="text-center">
            Se ha enviado un código al correo asociado a <strong>${username}</strong>. Ingresa el código para continuar.
          </p>
          <form id="loginVerificationForm">
            <div class="mb-3">
              <label for="verificationCode" class="form-label">Código de verificación</label>
              <input type="text" class="form-control" id="verificationCode" required>
            </div>
            <button type="submit" class="btn btn-primary w-100">Verificar</button>
          </form>
        </div>
      </div>
    </div>
  `;

  document.getElementById("loginVerificationForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = document.getElementById("verificationCode").value.trim();

    try {
      const resp = await fetch(`${API_BASE_URL}/api/users/login/verify/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, code }),
      });

      const data = await resp.json();
      if (resp.ok) {
        if (!data.access || !data.refresh) {
          alert("No se recibieron los tokens correctamente");
          return;
        }
        setToken(username, data.access);
        setRefreshToken(data.refresh);
        setUsername(data.user.username);
        alert("¡Verificación exitosa!");
        window.location.hash = "#home";
      } else {
        alert(data.error || "Código incorrecto.");
      }
    } catch (err) {
      console.error("Error en la verificación:", err);
      alert("Error en la conexión al servidor.");
    }
  });
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
  const usernametoken = getUsername();
  const token = usernametoken ? getToken(usernametoken) : null;
  const currentUser = getUsername();
  if (!token || !currentUser) {
    window.location.hash = "#login";
    return;
  }
  const wsUrl = `${WS_BASE_URL}/ws/pong/${roomId}/?token=${token}`;
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
// Función auxiliar para actualizar las estadísticas del usuario actual


function displayGameOver(gameData) {
  console.log("==> GAME OVER DATA:", gameData);
  gameOver = true;
  document.removeEventListener("keydown", onPongKeyDown);

  // Determinar el ganador usando la variable global "players"
  let winner = "Desconocido";
  if (players.player1 && players.player2) {
    if (gameData.score1 > gameData.score2) {
      winner = players.player1;
    } else if (gameData.score2 > gameData.score1) {
      winner = players.player2;
    }
  }
  

  // Actualizar las estadísticas del usuario: si el usuario es ganador, suma 1 en wins;
  // de lo contrario, suma 1 en losses.
  if (getUsername() === winner) {
    updateMyStats("win");
    saveMatchResult(players.player1, players.player2, gameData.score1, gameData.score2, winner);
  } else {
    updateMyStats("loss");
  }

  // Determinar el mensaje a mostrar
  let resultMessage = (getUsername() === winner) ? "¡Has ganado!" : "Has perdido";

  // Crear el overlay de game over
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
    // Opcional: aquí podrías llamar a updateMyStats() o alguna función para refrescar el DOM,
    // pero en este caso ya se actualizó la estadística con updateMyStats()
  };
  overlay.appendChild(btn);

  document.body.appendChild(overlay);
}


function updateMyStats(statType) {
  const usernametoken = getUsername();
  const token = usernametoken ? getToken(usernametoken) : null;
  fetch(`${API_BASE_URL}/api/users/update_my_stat/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    body: JSON.stringify({ stat: statType })  // "win" o "loss"
  })
    .then(response => response.json())
    .then(data => {
      console.log("✅ Stats actualizadas:", data);
    })
    .catch(err => {
      console.error("❌ Error actualizando stats:", err);
    });
}

function saveMatchResult(player1, player2, score1, score2, winner) {
  const usernametoken = getUsername();
  const token = usernametoken ? getToken(usernametoken) : null;
  fetch(`${API_BASE_URL}/api/users/save_match/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      player1,
      player2,
      score1,
      score2,
      winner
    })
  })
  .then(res => {
    if (!res.ok) {
      return res.json().then(err => { throw err; });
    }
    return res.json();
  })
  .then(data => {
    console.log("🎮 Partida guardada:", data);
  })
  .catch(err => {
    console.error("❌ Error al guardar partida:", err);
  });
}





/****************************************************
 * WS Y FUNCIONES PARA CHAT, INVITACIONES, etc.
 ****************************************************/
function initUsersWebSocket() {
  const usernametoken = getUsername();
  const token = usernametoken ? getToken(usernametoken) : null;
  const currentUser = getUsername();
  if (!token || !currentUser) return;
  const wsUrl = `${WS_BASE_URL}/ws/online_users/?token=${token}`;
  console.log("Abriendo userSocket:", wsUrl);
  userSocket = new WebSocket(wsUrl);
  userSocket.onopen = () => console.log("userSocket abierto");
  userSocket.onclose = (evt) => console.log("userSocket cerrado", evt);
  userSocket.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.users) {
        // Actualiza la lista global de usuarios online
        globalOnlineUsers = data.users;
        updateUsersList(data.users, getUsername());
        // Si la vista de amigos está visible, actualizamos la lista de amigos
        if (document.getElementById("friendsListContainer")) {
          // Se actualiza la lista de amigos usando data.friends si existe,
          // o un array vacío de lo contrario
          updateFriendsList(data.friends || []);
        }
      } else if (data.type === "friend_update") {
        // Actualiza la lista de amigos en directo
        updateFriendsList(data.friends);
      } else if (data.type === "invite" && data.to === getUsername()) {
        showInvitationReceived(data);
      } else if (data.type === "cancel_invite" && data.to === getUsername()) {
        alert(`La invitación de ${data.from} ha sido cancelada.`);
      } else if (data.type === "start_game") {
        const inviteModal = document.getElementById("inviteModal");
        if (inviteModal) {
          const instance = bootstrap.Modal.getInstance(inviteModal);
          if (instance) instance.hide();
        }
        window.location.hash = `pong?room=${data.game_data.room}`;
      }
    } catch (err) {
      console.error("Error en userSocket.onmessage:", err);
    }
  };

  function updateUsersList(users, currentUser) {
    const ul = document.getElementById("usersList");
    if (!ul) return;
    ul.innerHTML = "";
    users.forEach((u) => {
      const li = document.createElement("li");
      li.className = "nav-item py-1";
      li.textContent = (u === currentUser) ? `${u} (tú)` : u;
      if (u !== currentUser) {
        li.style.cursor = "pointer";
        li.addEventListener("click", () => inviteUser(u, currentUser));
      }
      ul.appendChild(li);
    });
  }
}


let friendsPollingInterval = null;

function pollFriendsList() {
  console.log("Ejecutando pollFriendsList...");
  const usernametoken = getUsername();
  const token = usernametoken ? getToken(usernametoken) : null;
  fetch(`${API_BASE_URL}/api/users/detail/`, {
    headers: { "Authorization": "Bearer " + token }
  })
    .then(response => response.json())
    .then(data => {
      if (data.friends) {
        let context = currentFriendsViewContext;
        if (!context) {
          if (window.location.hash.includes("chat")) {
            context = "chat";
          } else if (window.location.hash.includes("friends")) {
            context = "friends";
          } else {
            context = "friends";
          }
        }
        updateFriendsList(data.friends, context);
      }
    })
    .catch(err => console.error("Error polling friend list:", err));
}

function startPollingFriendsList() {
  if (friendsPollingInterval) return; 
  friendsPollingInterval = setInterval(pollFriendsList, 1000);
}

function stopPollingFriendsList() {
  if (friendsPollingInterval) {
    clearInterval(friendsPollingInterval);
    friendsPollingInterval = null;
  }
}



function inviteUser(toUser, fromUser) {
  document.getElementById("inviteModalTitle").textContent = `Invitar a ${toUser}`;
  document.getElementById("inviteModalBody").textContent = `¿Deseas invitar a ${toUser}?`;
  window.invitedUser = toUser;
  const modal = new bootstrap.Modal(document.getElementById("inviteModal"));
  modal.show();
}

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
  // Comprobar si el remitente está bloqueado
  if (globalBlockedUsers.includes(inviteData.from)) {
    console.log(`⚠️ Invitación bloqueada de ${inviteData.from}`);
    return; // Ignorar invitación
  }

  // Mostrar modal si no está bloqueado
  document.getElementById("inviteResponseModalTitle").textContent = "Invitación recibida";
  document.getElementById("inviteResponseModalBody").textContent =
    `${inviteData.from} te ha invitado a jugar Pong. ¿Aceptas?`;
  window.inviteFromUser = inviteData.from;

  const modal = new bootstrap.Modal(document.getElementById("inviteResponseModal"));
  modal.show();
}


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


function renderGameLocalView() {
  // Si existe una vista local anterior, la limpiamos
  if (window.cleanupLocalGameView) {
    window.cleanupLocalGameView();
  }
  
  // Inyecta el HTML del juego local en el contenedor "app" (la sidebar se mantiene fija)
  const contentHtml = `
    <div class="text-center">
      <h2>Juego Local Pong</h2>
      <canvas id="gameCanvasLocal" width="800" height="400" style="background: #000;"></canvas>
      <div id="localScore" class="mt-2 d-flex justify-content-between" style="max-width: 800px; margin: 0 auto;">
        <div id="localLeftScore">0</div>
        <div id="localRightScore">0</div>
      </div>
      <p id="localCountdown" style="font-size:1.5rem; margin-top:10px; color:black;"></p>
    </div>
  `;
  renderLayout(contentHtml);

  // Reinicia las variables globales del juego local
  window.localGameOver = false;
  window.localPaddleLeft = 50;
  window.localPaddleRight = 50;
  window.localBallPos = { x: 50, y: 50 };

  // Genera un roomId aleatorio para el juego local (puedes usar uno fijo si lo prefieres)
  const localRoomId = Math.floor(Math.random() * 10000);

  // Inicializa el WebSocket y el loop de dibujo del canvas para el juego local
  initLocalGameWebSocket(localRoomId);
  initLocalGameCanvasLoop();

  // Inicia la cuenta atrás para comenzar la partida
  startLocalGameCountdown(localRoomId);
}

function initLocalGameWebSocket(roomId) {
  const wsUrl = `${WS_BASE_URL}/ws/local_pong/`;
  console.log("Abriendo WS local:", wsUrl);
  const socket = new WebSocket(wsUrl);
  window.localPongSocket = socket;
  
  socket.onopen = () => {
    console.log("WS Local conectado.");
    // La partida NO se inicia aún; se iniciará después de la cuenta atrás.
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "initial_state" || data.type === "local_game_update") {
        updateLocalGame(data);
      } else if (data.type === "game_over") {
        displayLocalGameOver(data);
      }
    } catch (err) {
      console.error("Error procesando mensaje del WS local:", err);
    }
  };

  socket.onerror = (error) => {
    console.error("Error en WS local:", error);
  };

  // Agrega los listeners para teclado usando las funciones definidas
  document.addEventListener("keydown", handleLocalKeyDown);
  document.addEventListener("keyup", handleLocalKeyUp);
}

function initLocalGameCanvasLoop() {
  const canvas = document.getElementById("gameCanvasLocal");
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
    
    // Dibuja la pelota
    const bx = (window.localBallPos.x / 100) * cw;
    const by = (window.localBallPos.y / 100) * ch;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(bx, by, ballRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Dibuja las palas
    const leftPaddleY = (window.localPaddleLeft / 100) * ch - paddleHeight / 2;
    const rightPaddleY = (window.localPaddleRight / 100) * ch - paddleHeight / 2;
    const leftPaddleX = 0.05 * cw;
    const rightPaddleX = cw - 0.05 * cw - paddleWidth;
    ctx.fillStyle = "#fff";
    ctx.fillRect(leftPaddleX, leftPaddleY, paddleWidth, paddleHeight);
    ctx.fillRect(rightPaddleX, rightPaddleY, paddleWidth, paddleHeight);
    
    if (!window.localGameOver) {
      requestAnimationFrame(drawFrame);
    }
  }
  drawFrame();
}

function startLocalGameCountdown(roomId) {
  const countdownEl = document.getElementById("localCountdown");
  let count = 3;
  countdownEl.textContent = count;
  const intervalId = setInterval(() => {
    count--;
    if (count > 0) {
      countdownEl.textContent = count;
    } else if (count === 0) {
      countdownEl.textContent = "GO!";
    } else {
      clearInterval(intervalId);
      countdownEl.textContent = "";
      // Al finalizar la cuenta atrás, inicia la partida enviando "start_game"
      if (window.localPongSocket && window.localPongSocket.readyState === WebSocket.OPEN) {
        window.localPongSocket.send(JSON.stringify({ type: "start_game" }));
      }
    }
  }, 1000);
}

function updateLocalGame(gameState) {
  window.localBallPos = { x: gameState.ball_x, y: gameState.ball_y };
  window.localPaddleLeft = gameState.paddle_left;
  window.localPaddleRight = gameState.paddle_right;
  document.getElementById("localLeftScore").textContent = gameState.score_left;
  document.getElementById("localRightScore").textContent = gameState.score_right;
}

function renderGameLocalView() {
  // Limpia la vista local previa, si existe
  if (window.cleanupLocalGameView) {
    window.cleanupLocalGameView();
  }
  
  // Marca la vista local como activa
  window.localGameActive = true;
  
  const contentHtml = `
    <div class="text-center">
      <h2>Juego Local Pong</h2>
      <canvas id="gameCanvasLocal" width="800" height="400" style="background: #000;"></canvas>
      <div id="localScore" class="mt-2 d-flex justify-content-between" style="max-width: 800px; margin: 0 auto;">
        <div id="localLeftScore">0</div>
        <div id="localRightScore">0</div>
      </div>
      <p id="localCountdown" style="font-size:1.5rem; margin-top:10px; color: black;"></p>
    </div>
  `;
  renderLayout(contentHtml);

  // Reinicia las variables del juego local
  window.localGameOver = false;
  window.localPaddleLeft = 50;
  window.localPaddleRight = 50;
  window.localBallPos = { x: 50, y: 50 };

  const localRoomId = Math.floor(Math.random() * 10000);

  initLocalGameWebSocket(localRoomId);
  initLocalGameCanvasLoop();
  startLocalGameCountdown(localRoomId);
}

function initLocalGameWebSocket(roomId) {
  const wsUrl = `${WS_BASE_URL}/ws/local_pong/`;
  console.log("Abriendo WS local:", wsUrl);
  const socket = new WebSocket(wsUrl);
  window.localPongSocket = socket;
  
  socket.onopen = () => {
    console.log("WS Local conectado.");
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (!window.localGameActive) return; // No actualiza si la vista no está activa
      if (data.type === "initial_state" || data.type === "local_game_update") {
        updateLocalGame(data);
      } else if (data.type === "game_over") {
        displayLocalGameOver(data);
      }
    } catch (err) {
      console.error("Error procesando mensaje del WS local:", err);
    }
  };

  socket.onerror = (error) => {
    console.error("Error en WS local:", error);
  };

  document.addEventListener("keydown", handleLocalKeyDown);
  document.addEventListener("keyup", handleLocalKeyUp);
}

function initLocalGameCanvasLoop() {
  const canvas = document.getElementById("gameCanvasLocal");
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
    
    // Dibuja la pelota
    const bx = (window.localBallPos.x / 100) * cw;
    const by = (window.localBallPos.y / 100) * ch;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(bx, by, ballRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Dibuja las palas
    const leftPaddleY = (window.localPaddleLeft / 100) * ch - paddleHeight / 2;
    const rightPaddleY = (window.localPaddleRight / 100) * ch - paddleHeight / 2;
    const leftPaddleX = 0.05 * cw;
    const rightPaddleX = cw - 0.05 * cw - paddleWidth;
    ctx.fillStyle = "#fff";
    ctx.fillRect(leftPaddleX, leftPaddleY, paddleWidth, paddleHeight);
    ctx.fillRect(rightPaddleX, rightPaddleY, paddleWidth, paddleHeight);
    
    if (!window.localGameOver) {
      requestAnimationFrame(drawFrame);
    }
  }
  drawFrame();
}

function startLocalGameCountdown(roomId) {
  const countdownEl = document.getElementById("localCountdown");
  let count = 3;
  countdownEl.textContent = count;
  const intervalId = setInterval(() => {
    count--;
    if (count > 0) {
      countdownEl.textContent = count;
    } else if (count === 0) {
      countdownEl.textContent = "GO!";
    } else {
      clearInterval(intervalId);
      countdownEl.textContent = "";
      if (window.localPongSocket && window.localPongSocket.readyState === WebSocket.OPEN) {
        window.localPongSocket.send(JSON.stringify({ type: "start_game" }));
      }
    }
  }, 1000);
}

function updateLocalGame(gameState) {
  window.localBallPos = { x: gameState.ball_x, y: gameState.ball_y };
  window.localPaddleLeft = gameState.paddle_left;
  window.localPaddleRight = gameState.paddle_right;
  const leftScoreEl = document.getElementById("localLeftScore");
  const rightScoreEl = document.getElementById("localRightScore");
  if (leftScoreEl) leftScoreEl.textContent = gameState.score_left;
  if (rightScoreEl) rightScoreEl.textContent = gameState.score_right;
}

function displayLocalGameOver(data) {
  window.localGameOver = true;
  removeLocalGameListeners();
  
  const winner = data.winner || "Desconocido";
  const scoreLeft = data.score_left ?? 0;
  const scoreRight = data.score_right ?? 0;
  
  let resultMessage = (winner === "Player Left")
    ? "¡El jugador izquierdo ha ganado!"
    : "¡El jugador derecho ha ganado!";

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
  p.textContent = `Ganador: ${winner} | ${scoreLeft} - ${scoreRight}`;
  overlay.appendChild(p);

  const btn = document.createElement("button");
  btn.className = "btn btn-primary mt-3";
  btn.textContent = "Volver al Home";
  btn.onclick = () => {
    document.body.removeChild(overlay);
    cleanupLocalGameView();
    window.location.hash = "#home";
  };
  overlay.appendChild(btn);

  document.body.appendChild(overlay);
}

// Definimos los listeners de teclado
function handleLocalKeyDown(e) {
  if (e.repeat) return;
  let message = null;
  if (e.code === "KeyW") {
    message = { type: "paddle_input", paddle: "left", speed: -3 };
  } else if (e.code === "KeyS") {
    message = { type: "paddle_input", paddle: "left", speed: 3 };
  } else if (e.code === "ArrowUp") {
    message = { type: "paddle_input", paddle: "right", speed: -3 };
  } else if (e.code === "ArrowDown") {
    message = { type: "paddle_input", paddle: "right", speed: 3 };
  }
  if (message && window.localPongSocket && window.localPongSocket.readyState === WebSocket.OPEN) {
    window.localPongSocket.send(JSON.stringify(message));
  }
}

function handleLocalKeyUp(e) {
  let message = null;
  if (e.code === "KeyW" || e.code === "KeyS") {
    message = { type: "paddle_input", paddle: "left", speed: 0 };
  } else if (e.code === "ArrowUp" || e.code === "ArrowDown") {
    message = { type: "paddle_input", paddle: "right", speed: 0 };
  }
  if (message && window.localPongSocket && window.localPongSocket.readyState === WebSocket.OPEN) {
    window.localPongSocket.send(JSON.stringify(message));
  }
}

function removeLocalGameListeners() {
  document.removeEventListener("keydown", handleLocalKeyDown);
  document.removeEventListener("keyup", handleLocalKeyUp);
}

function cleanupLocalGameView() {
  removeLocalGameListeners();
  if (window.localPongSocket && window.localPongSocket.readyState === WebSocket.OPEN) {
    window.localPongSocket.close();
  }
  window.localPongSocket = null;
  // Marca la vista local como inactiva
  window.localGameActive = false;
}

// Almacena la función de limpieza globalmente para que el router pueda invocarla al cambiar de vista
window.cleanupLocalGameView = cleanupLocalGameView;



/**
 * Muestra el formulario para registrar los 4 jugadores.
 */
function renderTournamentView() {
  const formHtml = `
    <div id="tournamentForm" class="mt-4">
      <h3>Registro de Jugadores</h3>
      <form id="tournamentPlayersForm">
        <div class="mb-2">
          <label for="player1">Player 1:</label>
          <input type="text" id="player1" class="form-control" maxlength="10" placeholder="Nombre">
        </div>
        <div class="mb-2">
          <label for="player2">Player 2:</label>
          <input type="text" id="player2" class="form-control" maxlength="10" placeholder="Nombre">
        </div>
        <div class="mb-2">
          <label for="player3">Player 3:</label>
          <input type="text" id="player3" class="form-control" maxlength="10" placeholder="Nombre">
        </div>
        <div class="mb-2">
          <label for="player4">Player 4:</label>
          <input type="text" id="player4" class="form-control" maxlength="10" placeholder="Nombre">
        </div>
        <button type="submit" class="btn btn-success">Validar</button>
      </form>
      <div id="tournamentError" class="text-danger mt-2"></div>
    </div>
  `;
  const mainContent = document.getElementById("mainContent");
  mainContent.innerHTML = formHtml;
  
  document.getElementById("tournamentPlayersForm").addEventListener("submit", function(e) {
    e.preventDefault();
    const player1 = document.getElementById("player1").value.trim();
    const player2 = document.getElementById("player2").value.trim();
    const player3 = document.getElementById("player3").value.trim();
    const player4 = document.getElementById("player4").value.trim();
    
    const players = [player1, player2, player3, player4];
    const errorEl = document.getElementById("tournamentError");
    
    // Validaciones: no vacíos, sin espacios y nombres únicos.
    for (let i = 0; i < players.length; i++) {
      if (!players[i]) {
        errorEl.textContent = `Player ${i + 1} no puede estar vacío.`;
        return;
      }
      if (/\s/.test(players[i])) {
        errorEl.textContent = `Player ${i + 1} no puede contener espacios.`;
        return;
      }
    }
    if (new Set(players).size < players.length) {
      errorEl.textContent = "Los nombres de los jugadores deben ser únicos.";
      return;
    }
    errorEl.textContent = "";
    renderTournamentBracket(players);
  });
}

/**
 * Recibe el array de 4 jugadores, los baraja aleatoriamente y muestra un bracket.
 * Se muestra la estructura del torneo (ronda 1, final y winner) junto con un botón "Play".
 */
function renderTournamentBracket(players) {
  shuffleArray(players); // Baraja el array (algoritmo Fisher-Yates)

  const bracketHtml = `
    <div class="bracket-container">
      <!-- Columna Izquierda (Ronda 1) -->
      <div class="round-col">
        <!-- Match 1 -->
        <div class="match-box">
          <div class="player">${players[0]}</div>
          <div class="player">${players[1]}</div>
          <div class="connector connector-top"></div>
        </div>
        <!-- Match 2 -->
        <div class="match-box">
          <div class="player">${players[2]}</div>
          <div class="player">${players[3]}</div>
          <div class="connector connector-bottom"></div>
        </div>
      </div>

      <!-- Columna de Conectores entre Ronda 1 y la Final -->
      <div class="lines-col">
        <div class="connector-line final-connector-top"></div>
        <div class="connector-line final-connector-bottom"></div>
      </div>

      <!-- Columna Central (Final) -->
      <div class="round-col final-col">
        <div class="match-box match-final">
          <!-- Cuadro final vacío (tamaño igual a los match-box) -->
          <div class="player"></div>
          <div class="player"></div>
        </div>
      </div>

      <!-- Conector entre la Final y el Winner Box -->
      <div class="lines-col">
        <div class="connector-line final-winner-line"></div>
      </div>

      <!-- Columna Derecha (Winner Box) -->
      <div class="round-col winner-col">
        <div class="match-box winner-box">
          <!-- Cuadro del ganador vacío -->
          <div class="player"></div>
        </div>
      </div>
    </div>
    <div class="text-center mt-4">
      <button id="tournamentPlayBtn" class="btn btn-primary">Play</button>
    </div>
  `;
  const mainContent = document.getElementById("mainContent");
  mainContent.innerHTML = bracketHtml;
  
  // Al pulsar Play, inicia el torneo
  document.getElementById("tournamentPlayBtn").addEventListener("click", () => {
    startTournament(players);
  });
}

/**
 * Función para iniciar un partido del torneo entre dos jugadores.
 * Primero muestra una pantalla previa (pre-match) con los nombres y sus posiciones,
 * y un botón "Go" para empezar el encuentro. Al pulsarlo, se lanza el partido.
 *
 * @param {string} playerLeft - Nombre del jugador que juega por la izquierda.
 * @param {string} playerRight - Nombre del jugador que juega por la derecha.
 * @param {Function} onMatchComplete - Callback que recibe {winner, score_left, score_right}.
 */
function startTournamentMatch(playerLeft, playerRight, onMatchComplete) {
  // Primero mostramos la pantalla previa al partido.
  showPreMatchScreen(playerLeft, playerRight, function() {
    // Cuando se pulse "Go", se lanza el partido.
    launchTournamentMatch(playerLeft, playerRight, onMatchComplete);
  });
}

/**
 * Muestra la pantalla previa al partido con los nombres de los jugadores y un botón "Go".
 * Se indica quién es jugador de la izquierda y quién de la derecha.
 *
 * @param {string} playerLeft - Nombre del jugador de la izquierda.
 * @param {string} playerRight - Nombre del jugador de la derecha.
 * @param {Function} onGo - Callback que se ejecuta al pulsar el botón "Go".
 */
function showPreMatchScreen(playerLeft, playerRight, onGo) {
  const preMatchHtml = `
    <div class="text-center">
      <h2>Próximo Partido</h2>
      <p>
        <strong>${playerLeft}</strong> vs <strong>${playerRight}</strong>
      </p>
      <div class="mt-4">
        <button id="preMatchGoBtn" class="btn btn-primary">Go</button>
      </div>
    </div>
  `;
  renderLayout(preMatchHtml);
  document.getElementById("preMatchGoBtn").addEventListener("click", onGo);
}

/**
 * Lanza el partido en sí: renderiza la vista del juego, conecta el WS, inicia la cuenta atrás
 * (desde 5) y controla el juego. Se espera el mensaje "game_over" del WS para mostrar el overlay con "Next".
 *
 * @param {string} playerLeft - Nombre del jugador de la izquierda.
 * @param {string} playerRight - Nombre del jugador de la derecha.
 * @param {Function} onMatchComplete - Callback que recibe {winner, score_left, score_right}.
 */
function launchTournamentMatch(playerLeft, playerRight, onMatchComplete) {
  const contentHtml = `
    <div class="text-center">
      <h2>Partido: ${playerLeft} vs ${playerRight}</h2>
      <p>
        <span id="displayLeft">${playerLeft}</span> – 
        <span id="displayRight">${playerRight}</span>
      </p>
      <canvas id="tournamentGameCanvas" width="800" height="400" style="background: #000;"></canvas>
      <div id="tournamentScore" class="mt-2 d-flex justify-content-between" style="max-width: 800px; margin: 0 auto;">
        <div id="tournamentLeftScore">0</div>
        <div id="tournamentRightScore">0</div>
      </div>
      <p id="tournamentCountdown" style="font-size:1.5rem; margin-top:10px; color:black;"></p>
    </div>
  `;
  renderLayout(contentHtml);
  
  window.tournamentGameOver = false;
  window.tournamentPaddleLeft = 50;
  window.tournamentPaddleRight = 50;
  window.tournamentBallPos = { x: 50, y: 50 };
  
  const wsUrl = `${WS_BASE_URL}/ws/local_pong/`;
  const localSocket = new WebSocket(wsUrl);
  window.tournamentLocalSocket = localSocket;
  
  localSocket.onopen = () => {
    console.log("WS torneo partido conectado.");
    startTournamentCountdown(localSocket);
  };
  
  localSocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "initial_state" || data.type === "local_game_update") {
        updateTournamentGame(data);
      } else if (data.type === "game_over") {
        // Si el WS indica "Player Left", se toma como ganador a playerLeft, de lo contrario playerRight.
        let computedWinner = (data.winner === "Player Left") ? playerLeft : playerRight;
        data.winner = computedWinner;
        displayTournamentGameOver(data, localSocket, onMatchComplete);
      }
    } catch (err) {
      console.error("Error en WS torneo partido:", err);
    }
  };
  
  localSocket.onerror = (error) => {
    console.error("Error en WS torneo partido:", error);
  };
  
  // Listeners para teclado (movimiento fluido)
  document.addEventListener("keydown", tournamentHandleKeyDown);
  document.addEventListener("keyup", tournamentHandleKeyUp);
  
  function startTournamentCountdown(socket) {
    const countdownEl = document.getElementById("tournamentCountdown");
    let count = 5; // Inicia la cuenta desde 5
    countdownEl.textContent = count;
    const intervalId = setInterval(() => {
      count--;
      if (count > 0) {
        countdownEl.textContent = count;
      } else if (count === 0) {
        countdownEl.textContent = "GO!";
      } else {
        clearInterval(intervalId);
        countdownEl.textContent = "";
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "start_game" }));
        }
      }
    }, 1000);
  }
  
  function updateTournamentGame(gameState) {
    window.tournamentBallPos = { x: gameState.ball_x, y: gameState.ball_y };
    window.tournamentPaddleLeft = gameState.paddle_left;
    window.tournamentPaddleRight = gameState.paddle_right;
    document.getElementById("tournamentLeftScore").textContent = gameState.score_left;
    document.getElementById("tournamentRightScore").textContent = gameState.score_right;
    drawTournamentGame();
  }
  
  function drawTournamentGame() {
    const canvas = document.getElementById("tournamentGameCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const cw = canvas.width;
    const ch = canvas.height;
    const paddleWidth = 10;
    const paddleHeight = 80;
    const ballRadius = 10;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cw, ch);
    // Dibuja la pelota
    const bx = (window.tournamentBallPos.x / 100) * cw;
    const by = (window.tournamentBallPos.y / 100) * ch;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(bx, by, ballRadius, 0, Math.PI * 2);
    ctx.fill();
    // Dibuja las palas
    const leftPaddleY = (window.tournamentPaddleLeft / 100) * ch - paddleHeight / 2;
    const rightPaddleY = (window.tournamentPaddleRight / 100) * ch - paddleHeight / 2;
    const leftPaddleX = 0.05 * cw;
    const rightPaddleX = cw - 0.05 * cw - paddleWidth;
    ctx.fillStyle = "#fff";
    ctx.fillRect(leftPaddleX, leftPaddleY, paddleWidth, paddleHeight);
    ctx.fillRect(rightPaddleX, rightPaddleY, paddleWidth, paddleHeight);
    if (!window.tournamentGameOver) {
      requestAnimationFrame(drawTournamentGame);
    }
  }
  
  function tournamentHandleKeyDown(e) {
    if (e.repeat) return;
    if (!window.tournamentLocalSocket || window.tournamentLocalSocket.readyState !== WebSocket.OPEN) return;
    let message = null;
    if (e.code === "KeyW") {
      message = { type: "paddle_input", paddle: "left", speed: -3 };
    } else if (e.code === "KeyS") {
      message = { type: "paddle_input", paddle: "left", speed: 3 };
    } else if (e.code === "ArrowUp") {
      message = { type: "paddle_input", paddle: "right", speed: -3 };
    } else if (e.code === "ArrowDown") {
      message = { type: "paddle_input", paddle: "right", speed: 3 };
    }
    if (message) {
      window.tournamentLocalSocket.send(JSON.stringify(message));
    }
  }
  
  function tournamentHandleKeyUp(e) {
    if (!window.tournamentLocalSocket || window.tournamentLocalSocket.readyState !== WebSocket.OPEN) return;
    let message = null;
    if (e.code === "KeyW" || e.code === "KeyS") {
      message = { type: "paddle_input", paddle: "left", speed: 0 };
    } else if (e.code === "ArrowUp" || e.code === "ArrowDown") {
      message = { type: "paddle_input", paddle: "right", speed: 0 };
    }
    if (message) {
      window.tournamentLocalSocket.send(JSON.stringify(message));
    }
  }
  
  
  function displayTournamentGameOver(resultData, socket, callback) {
    window.tournamentGameOver = true;
    document.removeEventListener("keydown", tournamentHandleKeyDown);
    document.removeEventListener("keyup", tournamentHandleKeyUp);
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.backgroundColor = "rgba(0,0,0,0.7)";
    overlay.style.display = "flex";
    overlay.style.flexDirection = "column";
    overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center";
    overlay.style.zIndex = "9999";
    const h2 = document.createElement("h2");
    h2.style.color = "#fff";
    h2.textContent = `${resultData.winner} gana (${resultData.score_left} - ${resultData.score_right})`;
    overlay.appendChild(h2);
    const nextBtn = document.createElement("button");
    nextBtn.className = "btn btn-primary mt-3";
    nextBtn.textContent = "Next";
    nextBtn.onclick = () => {
      document.body.removeChild(overlay);
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      callback(resultData);
    };
    overlay.appendChild(nextBtn);
    document.body.appendChild(overlay);
  }
}

/**
 * Orquesta el torneo local: tres partidos (Match 1, Match 2 y la Final).
 * Al finalizar, muestra el podio final.
 */
function startTournament(players) {
  const tournamentResults = {
    match1: null,
    match2: null,
    final: null
  };
  
  // Primer partido: players[0] vs players[1]
  startTournamentMatch(players[0], players[1], function(result1) {
    tournamentResults.match1 = result1;
    // Segundo partido: players[2] vs players[3]
    startTournamentMatch(players[2], players[3], function(result2) {
      tournamentResults.match2 = result2;
      const winner1 = result1.winner;
      const winner2 = result2.winner;
      // Final: entre los ganadores
      startTournamentMatch(winner1, winner2, function(finalResult) {
        tournamentResults.final = finalResult;
        // Podio: el ganador de la final es 1°, el perdedor es 2°.
        // Los perdedores de la primera ronda se asignan aleatoriamente a 3° y 4°.
        const loser1 = (winner1 === players[0]) ? players[1] : players[0];
        const loser2 = (winner2 === players[2]) ? players[3] : players[2];
        const podium = {
          first: finalResult.winner,
          second: (finalResult.winner === winner1) ? winner2 : winner1,
          third: "",
          fourth: ""
        };
        const losers = [loser1, loser2];
        shuffleArray(losers);
        podium.third = losers[0];
        podium.fourth = losers[1];
        renderTournamentPodium(podium);
      });
    });
  });
}

/**
 * Muestra el podio final en el DOM.
 */
function renderTournamentPodium(podium) {
  const contentHtml = `
    <h2 class="text-center mt-4">Podio del Torneo</h2>
    <div class="text-center">
      <p><strong>1°:</strong> ${podium.first}</p>
      <p><strong>2°:</strong> ${podium.second}</p>
      <p><strong>3°:</strong> ${podium.third}</p>
      <p><strong>4°:</strong> ${podium.fourth}</p>
    </div>
    <div class="text-center mt-4">
      <button id="restartTournamentBtn" class="btn btn-primary">Reiniciar Torneo</button>
    </div>
  `;
  renderLayout(contentHtml);
  document.getElementById("restartTournamentBtn").addEventListener("click", () => {
    renderTournamentView();
  });
}

/**
 * Función para barajar un array in-place (algoritmo Fisher-Yates).
 */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function cleanupTournamentSocket() {
  if (window.tournamentLocalSocket) {
    if (window.tournamentLocalSocket.readyState === WebSocket.OPEN) {
      window.tournamentLocalSocket.close();
    }
    window.tournamentLocalSocket = null;
  }
  document.removeEventListener("keydown", window.tournamentHandleKeyDown);
  document.removeEventListener("keyup", window.tournamentHandleKeyUp);
}















