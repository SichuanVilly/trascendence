/* 
  main.js
  - Router con 2 websockets distintos, uno para #home (usuarios), otro para #pong (partida).
  - Cada vez que cambias de vista, cierras el WS anterior y abres el de la vista actual.
*/

/****************************************************
 * 1) VAR GLOBALES Y UTILIDADES: TOKEN, WS, etc.
 ****************************************************/
let userSocket = null;  // WebSocket de usuarios online (en #home)
let pongSocket = null;  // WebSocket de la partida (en #pong)
let globalOnlineUsers = [];
let currentFriendsViewContext = "chat"; // "chat" para la vista de chat, "friends" para la pestaña de friends
let globalBlockedUsers = [];

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

function router() {
  const hash = window.location.hash.replace("#", "");
  const token = getToken();

  updateNavbarVisibility(!!token);
  //closeHomeWS();
  closePongWS();

  if (!token && hash !== "login" && hash !== "register") {
    window.location.hash = "#login";
    return;
  }

  if (token && hash !== "login" && hash !== "register") {
    if (!userSocket || userSocket.readyState !== WebSocket.OPEN) {
      initUsersWebSocket();
    }
  }

  if (hash.startsWith("pong")) {
    const roomId = getHashQueryParam("room");
    renderPongView(roomId);
    return;
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
    case "chat":
      renderChatView();
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
          : `http://localhost:8000/media/${avatarPath}`;

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
        window.location.hash = `game?friend=${friendName}`;
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
  fetch("http://localhost:8000/api/users/block-friend/", {
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
      console.error("Error blocking friend:", err);
      alert("Error al bloquear al amigo: " + (err.error || "Error desconocido."));
    });
}

function unblockFriend(friendName) {
  const token = getToken();
  fetch("http://localhost:8000/api/users/unblock-friend/", {
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
  fetch("http://localhost:8000/api/users/remove-friend/", {
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
  
  fetch("http://localhost:8000/api/users/detail/", {
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
        fetch("http://localhost:8000/api/users/add-friend/", {
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








// Vista Settings
function renderSettingsView() {
  const token = getToken();
  fetch("http://localhost:8000/api/users/detail/", {
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
      : `http://localhost:8000/${avatarPath}`;
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
        <p>Victorias: <span id="winsCount">${data.wins != null ? data.wins : 0}</span></p>
        <p>Derrotas: <span id="lossesCount">${data.losses != null ? data.losses : 0}</span></p>
      </div>
      <button class="btn btn-primary" id="saveSettingsBtn">Guardar cambios</button>
      <button class="btn btn-danger mt-2" id="deleteUserBtn">Borrar Usuario</button>
    `;
    renderLayout(contentHtml);
    document.getElementById("avatarImg").addEventListener("click", () => {
      document.getElementById("avatarInput").click();
    });
    document.getElementById("avatarInput").addEventListener("change", function() {
      const file = this.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
          document.getElementById("avatarImg").src = e.target.result;
        }
        reader.readAsDataURL(file);
      }
    });
    document.getElementById("saveSettingsBtn").addEventListener("click", () => {
      const formData = new FormData();
      const newUsername = document.getElementById("usernameInput").value;
      formData.append("username", newUsername);
      const avatarFile = document.getElementById("avatarInput").files[0];
      if (avatarFile) {
        formData.append("avatar", avatarFile);
      }
      fetch("http://localhost:8000/api/users/update/", {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + token },
        body: formData
      })
      .then(resp => {
        if (!resp.ok) {
          return resp.json().then(errData => { throw errData; });
        }
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
    // Botón para borrar usuario
    document.getElementById("deleteUserBtn").addEventListener("click", () => {
      if (confirm("¿Estás seguro de que deseas borrar tu cuenta? Esta acción no se puede deshacer.")) {
        fetch("http://localhost:8000/api/users/delete/", {
          method: "DELETE",
          headers: { "Authorization": "Bearer " + token }
        })
        .then(resp => {
          if (!resp.ok) {
            return resp.json().then(errData => { throw errData; });
          }
          return resp.json();
        })
        .then(data => {
          alert("Cuenta eliminada exitosamente.");
          logout();
        })
        .catch(err => {
          console.error("Error eliminando usuario:", err);
          alert("Error al eliminar la cuenta.");
        });
      }
    });
  })
  .catch(err => {
    console.error("Error fetching user details:", err);
  });
}


// Vista Chat
function renderChatView() {
  const token = getToken();
  fetch("http://localhost:8000/api/users/detail/", {
    headers: { "Authorization": "Bearer " + token }
  })
    .then(response => response.json())
    .then(data => {
      console.log("User data:", data);
      // Actualiza la variable global de bloqueados (suponiendo que data.blocked_friends es un array de objetos con username)
      globalBlockedUsers = data.blocked_friends.map(f => f.username);
      
      const contentHtml = `
        <h2>Chat</h2>
        <div class="row">
          <div class="col-12 col-md-3">
            <h5>Friends Online</h5>
            <div id="friendsListContainer">
              <!-- Aquí se inyectará la lista de amigos -->
            </div>
          </div>
          <div class="col-12 col-md-9">
            <p>Bienvenido al chat. Selecciona un amigo para chatear.</p>
          </div>
        </div>
      `;
      renderLayout(contentHtml);
      // Establece el contexto "chat" para que se muestren los botones correspondientes:
      currentFriendsViewContext = "chat";
      updateFriendsList(data.friends, "chat");
    })
    .catch(err => {
      console.error("Error fetching user details:", err);
      alert("Error al obtener datos del usuario.");
    });
}







// Vistas de Juego (IA, Local, Online) - Placeholders
function renderGameIaView() {
  const contentHtml = `<h2>Juego: IA</h2><p>Contenido para juego contra IA.</p>`;
  renderLayout(contentHtml);
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
      const resp = await fetch("http://localhost:8000/api/users/login/", {
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
      const resp = await fetch("http://localhost:8000/api/users/register/", {
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
 * 6) VISTA PONG (abre pongSocket)
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
  // Reiniciamos variables del juego
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

/****************************************************
 * WS Y FUNCIONES PARA CHAT, INVITACIONES, etc.
 ****************************************************/
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
  
  function pollFriendsList() {
    const token = getToken();
    fetch("http://localhost:8000/api/users/detail/", {
      headers: { "Authorization": "Bearer " + token }
    })
      .then(response => response.json())
      .then(data => {
        if (data.friends) {
          // Puedes utilizar la variable global currentFriendsViewContext
          // O bien, determinar el contexto basado en el hash actual:
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
  
  // Llama a pollFriendsList cada 1000 milisegundos (1 segundo)
  setInterval(pollFriendsList, 1000);
  
  
}

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

/****************************************************
 * 7) DISPLAY GAME OVER
 ****************************************************/
function displayGameOver(gameData) {
  console.log("==> GAME OVER DATA:", gameData);
  gameOver = true;
  document.removeEventListener("keydown", onPongKeyDown);
  let winner = gameData.winner || "Desconocido";
  let resultMessage = (getUsername() === winner) ? "¡Has ganado!" : "Has perdido";
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
