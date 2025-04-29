// Recupera el token y el nombre de usuario del almacenamiento local
const token = localStorage.getItem('token');
const currentUser = localStorage.getItem('username'); // Asegúrate de guardarlo en el login
console.log("Token recuperado:", token);
console.log("Usuario actual:", currentUser);

if (!token || !currentUser) {
  // Si falta alguno, redirige al login
  window.location.href = 'login.html';
}

// Construye la URL del WebSocket usando el token
const wsUrl = `ws://localhost:8000/ws/online_users/?token=${token}`;
console.log("Conectando a WebSocket en:", wsUrl);

// Conecta al WebSocket
const socket = new WebSocket(wsUrl);

socket.onopen = function(event) {
  console.log('Conectado al WebSocket');
};

socket.onmessage = function(event) {
  console.log('Mensaje recibido:', event.data);
  try {
    const data = JSON.parse(event.data);
    if (data.users) {
      updateUsersList(data.users);
    } else if (data.type === 'invite' && data.to === currentUser) {
      // Se recibió una invitación: mostrar modal para respuesta
      showInvitationReceived(data);
    } else if (data.type === 'cancel_invite' && data.to === currentUser) {
      alert(`La invitación de ${data.from} ha sido cancelada.`);
    } else if (data.type === 'start_game') {
      // Si se inicia el juego, ocultar el modal (si estuviera abierto) y redirigir a la partida
      const modalEl = document.getElementById('inviteModal');
      const instance = bootstrap.Modal.getInstance(modalEl);
      if (instance) instance.hide();
      window.location.href = `pong.html?room=${data.game_data.room}`;
    }
  } catch (err) {
    console.error('Error al parsear JSON:', err);
  }
};

socket.onclose = function(event) {
  console.log('WebSocket cerrado', event);
};

// Actualiza la lista de usuarios online
function updateUsersList(users) {
  const usersList = document.getElementById('usersList');
  usersList.innerHTML = '';
  users.forEach(user => {
    const li = document.createElement('li');
    li.className = 'nav-item px-3';
    // Agrega (tu) si es el usuario actual
    if (user === currentUser) {
      li.textContent = `${user} (tu)`;
    } else {
      li.textContent = user;
      li.style.cursor = 'pointer';
      // Al hacer clic sobre otro usuario, invoca la función de invitación
      li.addEventListener('click', function() {
        inviteUser(user);
      });
    }
    usersList.appendChild(li);
  });
}

// Función para invitar a otro usuario
function inviteUser(invitedUser) {
  // Restaura el estado inicial del modal (botón de confirmar visible)
  document.getElementById('btnInviteConfirm').style.display = 'inline-block';
  // Configura el contenido del modal de invitación
  const modalTitle = document.getElementById('inviteModalTitle');
  const modalBody = document.getElementById('inviteModalBody');
  modalTitle.textContent = `Invitar a ${invitedUser}`;
  modalBody.textContent = `¿Deseas invitar a ${invitedUser} a jugar Pong?`;
  
  // Guarda el usuario invitado de forma temporal
  window.invitedUser = invitedUser;
  
  // Muestra el modal de invitación
  const inviteModal = new bootstrap.Modal(document.getElementById('inviteModal'));
  inviteModal.show();
}

// Manejador para el botón de confirmar invitación
document.getElementById('btnInviteConfirm').addEventListener('click', function() {
  if (window.invitedUser && currentUser) {
    // Envía el mensaje de invitación por WebSocket
    socket.send(JSON.stringify({
      type: "invite",
      from: currentUser,
      to: window.invitedUser
    }));
    // Actualiza el modal a estado de "esperando respuesta"
    const modalTitle = document.getElementById('inviteModalTitle');
    const modalBody = document.getElementById('inviteModalBody');
    modalTitle.textContent = "Esperando respuesta";
    modalBody.textContent = `Esperando respuesta de ${window.invitedUser}...`;
    // Oculta el botón de confirmar para dejar solo el de cancelar
    document.getElementById('btnInviteConfirm').style.display = 'none';
    // El modal permanece abierto en modo espera
  }
});

// Manejador para el botón de cancelar invitación (en cualquier estado)
document.getElementById('btnInviteCancel').addEventListener('click', function() {
  if (window.invitedUser && currentUser) {
    // Envía la cancelación de la invitación
    socket.send(JSON.stringify({
      type: "cancel_invite",
      from: currentUser,
      to: window.invitedUser
    }));
  }
  // Al cerrar el modal, se puede limpiar la variable si se desea
  window.invitedUser = null;
});

// Función para mostrar la invitación recibida
function showInvitationReceived(inviteData) {
  const modalTitle = document.getElementById('inviteResponseModalTitle');
  const modalBody = document.getElementById('inviteResponseModalBody');
  modalTitle.textContent = `Invitación recibida`;
  modalBody.textContent = `${inviteData.from} te ha invitado a jugar Pong. ¿Aceptas?`;
  
  // Guarda el usuario que envió la invitación de forma temporal
  window.inviteFromUser = inviteData.from;
  
  // Muestra el modal de respuesta a la invitación
  const inviteResponseModal = new bootstrap.Modal(document.getElementById('inviteResponseModal'));
  inviteResponseModal.show();
}

// Manejadores para el modal de respuesta a la invitación
document.getElementById('btnAcceptInvite').addEventListener('click', function() {
  if (window.inviteFromUser && currentUser) {
    // Envía aceptación de la invitación
    socket.send(JSON.stringify({
      type: "accept_invite",
      from: currentUser,
      to: window.inviteFromUser
    }));
  }
  const modalEl = document.getElementById('inviteResponseModal');
  const modal = bootstrap.Modal.getInstance(modalEl);
  modal.hide();
});

document.getElementById('btnRejectInvite').addEventListener('click', function() {
  if (window.inviteFromUser && currentUser) {
    // Envía cancelación de la invitación
    socket.send(JSON.stringify({
      type: "cancel_invite",
      from: currentUser,
      to: window.inviteFromUser
    }));
    alert(`Has rechazado la invitación de ${window.inviteFromUser}`);
  }
  const modalEl = document.getElementById('inviteResponseModal');
  const modal = bootstrap.Modal.getInstance(modalEl);
  modal.hide();
});
