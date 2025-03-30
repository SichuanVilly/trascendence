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
          <h3 class="mb-4">FT_Transcendence</h3>
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
                  <li class="nav-item">
                    <a class="nav-link text-white" href="#game-online">Online</a>
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
  const token = getToken();
  
  updateNavbarVisibility(!!token);
  closePongWS();
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
  
  if (hash.startsWith("pong")) {
    const roomId = getHashQueryParam("room");
    renderPongView(roomId);
    return;
  }
  
  // Si la ruta es chat y hay un parámetro friend, se muestra el chat privado
  if (hash.startsWith("chat")) {
    const params = getHashQueryParams();
    if (params.friend) {
      renderPrivateChatView(params.friend);
      return;
    } else {
      // Si no hay parámetro, se muestra la vista general de chat (por ejemplo, la lista de amigos)
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
    case "game-online":
      renderGameOnlineView();
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
  clearToken();
  clearUsername();
  closeHomeWS();
  closePongWS();
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
          // Si el amigo está bloqueado, mostrar solo "Unblock"
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
              ${friend.username} ${statusHTML}
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
  const token = getToken();
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
  const token = getToken();
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
  const token = getToken();
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
  const token = getToken();
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
  const token = getToken();
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
  const token = getToken();
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
  const token = getToken();
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
          <p>Victorias: <span id="winsCount">${data.wins ?? 0}</span></p>
          <p>Derrotas: <span id="lossesCount">${data.losses ?? 0}</span></p>
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

      // Guardar cambios
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

      // 🔄 Cargar historial de partidas completo con scroll
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

          // Estilos para scroll y altura máxima
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
  const token = getToken();
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




function renderGameLocalView() {
  const contentHtml = `<h2>Juego: Local</h2><p>Contenido para juego local.</p>`;
  renderLayout(contentHtml);
}
function renderGameOnlineView() {
  const contentHtml = `<h2>Juego: Online</h2><p>Contenido para juego online.</p>`;
  renderLayout(contentHtml);
}

/****************************************************
 * 5) LOGIN Y REGISTER (Sin sidebar)
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
      const resp = await fetch(`${API_BASE_URL}/api/users/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
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
      const resp = await fetch(`${API_BASE_URL}/api/users/register/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
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
  const token = getToken();
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
  const token = getToken();
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
  const token = getToken();
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

  function pollFriendsList() {
    console.log("Ejecutando pollFriendsList...");
    const token = getToken();
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
              context = "friends"; // Valor por defecto
            }
          }
          updateFriendsList(data.friends, context);
        }
      })
      .catch(err => console.error("Error polling friend list:", err));
  }
  
  setInterval(pollFriendsList, 1000);
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

