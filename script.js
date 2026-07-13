// =============================================
// 🔥 IMPORTACIONES FIREBASE MODULAR v12
// =============================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
    getDatabase,
    ref,
    onValue,
    push,
    set,
    update,
    remove,
    onDisconnect,
    serverTimestamp,
    onChildAdded,
    query,
    orderByChild,
    limitToLast,
    get,
    off
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

// =============================================
// 🔥 CONFIGURACIÓN FIREBASE
// =============================================
const firebaseConfig = {
    apiKey: "AIzaSyCUlGCrSzUR-P5q3atgphjR8r_a9CuXKXc",
    authDomain: "mensajeres-redchonts.firebaseapp.com",
    databaseURL: "https://mensajeres-redchonts-default-rtdb.firebaseio.com",
    projectId: "mensajeres-redchonts",
    storageBucket: "mensajeres-redchonts.firebasestorage.app",
    messagingSenderId: "955213981545",
    appId: "1:955213981545:web:f84c823e3175acd3b67ff8",
    measurementId: "G-83F307F1TK"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// =============================================
// ESTADO GLOBAL
// =============================================
let currentUser = null;
let currentRoom = null;
let messagesUnsubscribe = null;
let typingUnsubscribe = null;
let typingTimeout = null;
let roomsData = {};
let previousMsgCount = 0;
let pendingPrivateRoomId = null; // 🆕 NUEVO

const DEFAULT_ROOMS = [
    { id: 'general', name: 'General', icon: '🌍', color: '#6c5ce7' },
    { id: 'random', name: 'Random', icon: '🎲', color: '#00b894' },
    { id: 'tech', name: 'Tecnología', icon: '💻', color: '#0984e3' },
    { id: 'gaming', name: 'Gaming', icon: '🎮', color: '#e17055' },
    { id: 'musica', name: 'Música', icon: '🎵', color: '#fdcb6e' },
];

const EMOJIS = [
    '😀','😂','🤣','😊','😍','🥰','😎','🤩','😏','🤔',
    '😢','😭','😤','🤯','🥳','😴','🤗','🫡','😈','👻',
    '👍','👎','👏','🙌','🤝','✌️','🤞','💪','🫶','❤️',
    '🔥','⭐','💯','✅','❌','⚡','💡','🎉','🎊','🏆',
    '🚀','💬','📢','🔔','💀','👀','🫠','🤡','💩','🙈'
];

// =============================================
// UTILIDADES
// =============================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getRandomColor() {
    const colors = ['#6c5ce7','#00b894','#0984e3','#e17055','#fdcb6e','#a29bfe','#fd79a8','#00cec9','#ff7675','#55efc4'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function formatMessage(text) {
    let safe = escapeHtml(text);
    safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/\*(.*?)\*/g, '<em>$1</em>');
    safe = safe.replace(/`(.*?)`/g, '<code style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;font-size:13px;">$1</code>');
    safe = safe.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:#74b9ff;text-decoration:underline;">$1</a>');
    safe = safe.replace(/\n/g, '<br>');
    return safe;
}

function showNotification(title, body) {
    const notif = document.createElement('div');
    notif.className = 'notification';
    notif.innerHTML = `<div class="notif-title">${title}</div><div class="notif-body">${body}</div>`;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

function playNotifSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.1;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.stop(ctx.currentTime + 0.3);
    } catch(e) {}
}

// 🆕 NUEVO: Hash de contraseñas
async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password + '_salt_chatapp_2026');
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(inputPassword, storedHash) {
    const inputHash = await hashPassword(inputPassword);
    return inputHash === storedHash;
}

// =============================================
// 🆕 NUEVO: GUARDAR/RECUPERAR USERNAME (localStorage)
// =============================================
const STORAGE_KEY_USERNAME = 'chatapp_username';

function saveUsername(name) {
    try { localStorage.setItem(STORAGE_KEY_USERNAME, name); } catch(e) {}
}

function loadSavedUsername() {
    try { return localStorage.getItem(STORAGE_KEY_USERNAME) || ''; } catch(e) { return ''; }
}

function clearSavedUsername() {
    try { localStorage.removeItem(STORAGE_KEY_USERNAME); } catch(e) {}
}

// =============================================
// LOGIN (actualizado con localStorage)
// =============================================
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const rememberCheckbox = document.getElementById('remember-checkbox'); // 🆕

// Cargar nombre guardado al iniciar
const savedName = loadSavedUsername();
if (savedName) {
    usernameInput.value = savedName;
    if (rememberCheckbox) rememberCheckbox.checked = true;
}

usernameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') joinChat();
});

joinBtn.addEventListener('click', joinChat);

async function joinChat() {
    const name = usernameInput.value.trim();
    if (!name) {
        usernameInput.focus();
        usernameInput.style.borderColor = 'var(--red)';
        setTimeout(() => usernameInput.style.borderColor = '', 1500);
        return;
    }

    // 🆕 Guardar o no el nombre
    if (rememberCheckbox && rememberCheckbox.checked) {
        saveUsername(name);
    } else {
        clearSavedUsername();
    }

    joinBtn.disabled = true;
    joinBtn.textContent = 'Conectando...';

    try {
        const cred = await signInAnonymously(auth);
        currentUser = {
            uid: cred.user.uid,
            name: name,
            color: getRandomColor()
        };

        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app').classList.add('active');
        document.getElementById('display-username').textContent = name;

        setupPresence();
        loadRooms();
        initEmojiPicker();
    } catch (err) {
        console.error('Error al conectar:', err);
        joinBtn.disabled = false;
        joinBtn.textContent = 'Entrar al Chat 🚀';
        alert('Error al conectar: ' + err.message + '\n\nVerifica:\n1. Authentication → Anónimo activado\n2. Realtime Database en modo prueba\n3. Tu conexión a internet');
    }
}

// =============================================
// PRESENCIA
// =============================================
function setupPresence() {
    const myRef = ref(db, `presence/${currentUser.uid}`);
    const connectedRef = ref(db, '.info/connected');

    onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            set(myRef, {
                name: currentUser.name,
                online: true,
                lastSeen: serverTimestamp()
            });
            onDisconnect(myRef).remove();
        }
    });

    const presenceRef = ref(db, 'presence');
    onValue(presenceRef, (snap) => {
        const count = snap.numChildren() || 0;
        const el = document.getElementById('online-num');
        if (el) el.textContent = count;
    });

    onValue(connectedRef, (snap) => {
        const bar = document.getElementById('connection-bar');
        if (!snap.val()) bar.classList.add('show');
        else bar.classList.remove('show');
    });
}

// =============================================
// SALAS (actualizado con privadas)
// =============================================
async function loadRooms() {
    for (const room of DEFAULT_ROOMS) {
        const roomRef = ref(db, `rooms/${room.id}`);
        const snap = await get(roomRef);
        if (!snap.exists()) {
            await set(roomRef, {
                name: room.name,
                icon: room.icon,
                color: room.color,
                private: false, // 🆕
                createdBy: 'system',
                createdAt: serverTimestamp()
            });
        }
    }

    const roomsRef = ref(db, 'rooms');
    onValue(roomsRef, (snap) => {
        roomsData = snap.val() || {};
        renderRooms();
    });
}

function renderRooms() {
    const container = document.getElementById('rooms-list');
    const roomEntries = Object.entries(roomsData);

    container.innerHTML = roomEntries.map(([id, room]) => {
        const isActive = currentRoom === id;
        const bg = room.color || '#6c5ce7';
        const isPrivate = room.private === true; // 🆕
        const lockIcon = isPrivate ? '<span class="private-badge">🔒</span>' : ''; // 🆕
        return `
            <div class="room-item ${isActive ? 'active' : ''}" onclick="window.openRoom('${id}')">
                <div class="room-icon" style="background:${bg}22; color:${bg};">
                    ${room.icon || '💬'}
                </div>
                <div class="room-info">
                    <div class="room-name">${escapeHtml(room.name)} ${lockIcon}</div>
                    <div class="room-preview">${escapeHtml(room.lastMessage || 'Sin mensajes aún')}</div>
                </div>
                <div class="room-meta">
                    <div class="room-time">${room.lastTime || ''}</div>
                </div>
            </div>
        `;
    }).join('');
}

window.openRoom = openRoom;

function openRoom(roomId) {
    const room = roomsData[roomId];
    if (!room) return;

    // 🆕 Si es privada, pedir contraseña
    if (room.private === true) {
        pendingPrivateRoomId = roomId;
        showPasswordModal();
        return;
    }

    enterRoom(roomId);
}

// 🆕 NUEVO: Función separada para entrar a la sala
function enterRoom(roomId) {
    currentRoom = roomId;
    const room = roomsData[roomId];
    if (!room) return;

    document.getElementById('empty-state').style.display = 'none';
    const activeChat = document.getElementById('active-chat');
    activeChat.classList.add('active');

    const isPrivate = room.private === true;
    const lockText = isPrivate ? ' 🔒' : '';
    document.getElementById('chat-room-name').textContent = room.name + lockText;
    document.getElementById('chat-room-icon').textContent = room.icon || '💬';
    document.getElementById('chat-room-icon').style.background = `${room.color || '#6c5ce7'}22`;
    document.getElementById('chat-room-members').textContent = isPrivate ? 'Sala privada' : 'Sala pública';

    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.add('hidden');
    }

    renderRooms();
    loadMessages(roomId);
    document.getElementById('msg-input').focus();
}

function showSidebar() {
    document.getElementById('sidebar').classList.remove('hidden');
}

// 🆕 NUEVO: Botón salir de la sala
const exitBtn = document.getElementById('exit-btn');
if (exitBtn) {
    exitBtn.addEventListener('click', exitRoom);
}

function exitRoom() {
    // Limpiar listeners
    if (messagesUnsubscribe) { messagesUnsubscribe(); messagesUnsubscribe = null; }
    if (typingUnsubscribe) { typingUnsubscribe(); typingUnsubscribe = null; }

    // Limpiar typing propio
    if (currentRoom && currentUser) {
        remove(ref(db, `typing/${currentRoom}/${currentUser.uid}`));
    }

    // Resetear estado
    currentRoom = null;
    previousMsgCount = 0;
    document.getElementById('messages-container').innerHTML = '';
    document.getElementById('typing-indicator').textContent = '';
    const msgInput = document.getElementById('msg-input');
    if (msgInput) {
        msgInput.value = '';
        msgInput.style.height = 'auto';
    }

    // Ocultar chat y mostrar empty-state
    document.getElementById('active-chat').classList.remove('active');
    document.getElementById('empty-state').style.display = 'flex';

    // En móvil, volver a mostrar el sidebar
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('hidden');
    }

    renderRooms();
}

// =============================================
// 🆕 NUEVO: MODAL DE CONTRASEÑA
// =============================================
const passwordModal = document.getElementById('password-modal');
const enterPasswordInput = document.getElementById('enter-password-input');
const passwordError = document.getElementById('password-error');

function showPasswordModal() {
    enterPasswordInput.value = '';
    passwordError.style.display = 'none';
    passwordModal.classList.add('show');
    setTimeout(() => enterPasswordInput.focus(), 100);
}

function hidePasswordModal() {
    passwordModal.classList.remove('show');
    pendingPrivateRoomId = null;
    enterPasswordInput.value = '';
    passwordError.style.display = 'none';
}

document.getElementById('password-cancel').addEventListener('click', hidePasswordModal);
document.getElementById('password-confirm').addEventListener('click', tryEnterPrivateRoom);

enterPasswordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tryEnterPrivateRoom();
});

enterPasswordInput.addEventListener('input', () => {
    enterPasswordInput.value = enterPasswordInput.value.replace(/[^0-9]/g, '');
    passwordError.style.display = 'none';
});

async function tryEnterPrivateRoom() {
    if (!pendingPrivateRoomId) return;
    const password = enterPasswordInput.value.trim();
    const room = roomsData[pendingPrivateRoomId];

    if (!room || !room.passwordHash) { hidePasswordModal(); return; }

    if (password.length !== 4) {
        passwordError.textContent = 'Deben ser 4 dígitos';
        passwordError.style.display = 'block';
        return;
    }

    const isValid = await verifyPassword(password, room.passwordHash);
    if (isValid) {
        const roomId = pendingPrivateRoomId;
        hidePasswordModal();
        enterRoom(roomId);
    } else {
        passwordError.textContent = 'Contraseña incorrecta';
        passwordError.style.display = 'block';
        enterPasswordInput.value = '';
        enterPasswordInput.focus();
    }
}

passwordModal.addEventListener('click', (e) => {
    if (e.target.id === 'password-modal') hidePasswordModal();
});

// =============================================
// MENSAJES (¡SIN CAMBIOS! Tu código original)
// =============================================
function loadMessages(roomId) {
    if (messagesUnsubscribe) messagesUnsubscribe();
    if (typingUnsubscribe) typingUnsubscribe();

    const container = document.getElementById('messages-container');
    container.innerHTML = '<div class="date-divider"><span>Cargando mensajes...</span></div>';
    previousMsgCount = 0;

    const messagesRef = ref(db, `messages/${roomId}`);
    const q = query(messagesRef, orderByChild('timestamp'), limitToLast(100));

    messagesUnsubscribe = onValue(q, (snap) => {
        container.innerHTML = '';
        const messages = [];
        snap.forEach(child => {
            messages.push(child.val());
        });

        if (messages.length === 0) {
            container.innerHTML = '<div class="system-msg">No hay mensajes aún. ¡Sé el primero!</div>';
            return;
        }

        let lastDate = '';
        messages.forEach(msg => {
            if (!msg) return;
            const msgDate = msg.timestamp ? new Date(msg.timestamp).toLocaleDateString('es') : '';
            if (msgDate && msgDate !== lastDate) {
                lastDate = msgDate;
                const divider = document.createElement('div');
                divider.className = 'date-divider';
                divider.innerHTML = `<span>${msgDate}</span>`;
                container.appendChild(divider);
            }
            appendMessage(msg, false);
        });

        if (previousMsgCount > 0 && messages.length > previousMsgCount) {
            const newMsg = messages[messages.length - 1];
            if (newMsg.uid !== currentUser.uid) {
                playNotifSound();
            }
        }
        previousMsgCount = messages.length;

        container.scrollTop = container.scrollHeight;
    });

    const typingRef = ref(db, `typing/${roomId}`);
    typingUnsubscribe = onValue(typingRef, (snap) => {
        const typingData = snap.val() || {};
        const typers = Object.entries(typingData)
            .filter(([uid, data]) => uid !== currentUser.uid && data && (Date.now() - (data.time || 0) < 3000))
            .map(([uid, data]) => data.name);

        const indicator = document.getElementById('typing-indicator');
        if (typers.length === 0) indicator.textContent = '';
        else if (typers.length === 1) indicator.textContent = `${typers[0]} está escribiendo...`;
        else indicator.textContent = `${typers.length} personas escribiendo...`;
    });
}

function appendMessage(msg, animate = true) {
    const container = document.getElementById('messages-container');
    const isOwn = msg.uid === currentUser.uid;

    const group = document.createElement('div');
    group.className = `msg-group ${isOwn ? 'own' : 'other'}`;

    const time = msg.timestamp ? new Date(msg.timestamp) : new Date();
    const timeStr = time.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

    group.innerHTML = `
        <div class="msg-sender" style="color:${msg.color || 'var(--accent)'}">${escapeHtml(msg.name || 'Anónimo')}</div>
        <div class="msg-bubble">${formatMessage(msg.text || '')}</div>
        <div class="msg-time">${timeStr}</div>
    `;

    if (!animate) group.style.animation = 'none';
    container.appendChild(group);
}

// =============================================
// ENVIAR MENSAJE (¡SIN CAMBIOS!)
// =============================================
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');

sendBtn.addEventListener('click', sendMessage);

msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

msgInput.addEventListener('input', () => {
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
    handleTyping();
});

async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || !currentRoom) return;

    const msg = {
        uid: currentUser.uid,
        name: currentUser.name,
        color: currentUser.color,
        text: text,
        timestamp: serverTimestamp()
    };

    const messagesRef = ref(db, `messages/${currentRoom}`);
    push(messagesRef, msg);

    const preview = text.length > 40 ? text.substring(0, 40) + '...' : text;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

    const roomRef = ref(db, `rooms/${currentRoom}`);
    update(roomRef, {
        lastMessage: `${currentUser.name}: ${preview}`,
        lastTime: timeStr
    });

    const typingRef = ref(db, `typing/${currentRoom}/${currentUser.uid}`);
    remove(typingRef);

    msgInput.value = '';
    msgInput.style.height = 'auto';
    msgInput.focus();
}

function handleTyping() {
    if (!currentRoom) return;
    const typingRef = ref(db, `typing/${currentRoom}/${currentUser.uid}`);
    set(typingRef, {
        name: currentUser.name,
        time: Date.now()
    });

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        remove(typingRef);
    }, 3000);
}

// =============================================
// EMOJIS (¡SIN CAMBIOS!)
// =============================================
function initEmojiPicker() {
    const picker = document.getElementById('emoji-picker');
    picker.innerHTML = '<div class="emoji-grid">' +
        EMOJIS.map(e => `<span onclick="window.insertEmoji('${e}')">${e}</span>`).join('') +
        '</div>';
}

window.insertEmoji = function(emoji) {
    const input = document.getElementById('msg-input');
    input.value += emoji;
    input.focus();
    document.getElementById('emoji-picker').classList.remove('show');
};

document.getElementById('emoji-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('emoji-picker').classList.toggle('show');
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.emoji-btn') && !e.target.closest('.emoji-picker')) {
        document.getElementById('emoji-picker')?.classList.remove('show');
    }
});

// =============================================
// MODAL NUEVA SALA (actualizado con privadas)
// =============================================
const roomNameInput = document.getElementById('room-name-input');
const roomIconInput = document.getElementById('room-icon-input');
const roomPrivateInput = document.getElementById('room-private-input'); // 🆕
const roomPasswordInput = document.getElementById('room-password-input'); // 🆕
const passwordGroup = document.getElementById('password-group'); // 🆕

document.getElementById('add-room-btn').addEventListener('click', () => {
    document.getElementById('modal-overlay').classList.add('show');
    document.getElementById('room-name-input').focus();
});

document.getElementById('btn-cancel').addEventListener('click', hideModal);
document.getElementById('btn-confirm').addEventListener('click', createRoom);

document.getElementById('room-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createRoom();
});

// 🆕 NUEVO: Toggle campos de contraseña
window.togglePrivateFields = function() {
    if (roomPrivateInput.checked) {
        passwordGroup.style.display = 'block';
        setTimeout(() => roomPasswordInput.focus(), 100);
    } else {
        passwordGroup.style.display = 'none';
        roomPasswordInput.value = '';
    }
};
roomPrivateInput.addEventListener('change', window.togglePrivateFields);

// 🆕 NUEVO: Solo números en contraseña
roomPasswordInput.addEventListener('input', () => {
    roomPasswordInput.value = roomPasswordInput.value.replace(/[^0-9]/g, '');
});

function hideModal() {
    document.getElementById('modal-overlay').classList.remove('show');
    document.getElementById('room-name-input').value = '';
    document.getElementById('room-icon-input').value = '';
    // 🆕 Limpiar campos privados
    roomPrivateInput.checked = false;
    roomPasswordInput.value = '';
    passwordGroup.style.display = 'none';
}

async function createRoom() {
    const nameInput = document.getElementById('room-name-input');
    const iconInput = document.getElementById('room-icon-input');
    const name = nameInput.value.trim();
    const icon = iconInput.value.trim() || '💬';

    if (!name) {
        nameInput.style.borderColor = 'var(--red)';
        setTimeout(() => nameInput.style.borderColor = '', 1500);
        return;
    }

    // 🆕 Validar contraseña si es privada
    const isPrivate = roomPrivateInput.checked;
    const password = roomPasswordInput.value.trim();

    if (isPrivate) {
        if (password.length !== 4 || !/^\d{4}$/.test(password)) {
            roomPasswordInput.style.borderColor = 'var(--red)';
            setTimeout(() => roomPasswordInput.style.borderColor = '', 1500);
            alert('La contraseña debe tener exactamente 4 dígitos numéricos.');
            return;
        }
    }

    const roomId = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    const color = getRandomColor();

    // 🆕 Construir datos de la sala
    const roomData = {
        name: name,
        icon: icon,
        color: color,
        private: isPrivate,
        createdBy: currentUser.name,
        createdAt: serverTimestamp(),
        lastMessage: isPrivate ? '🔒 Sala privada creada' : 'Sala creada',
        lastTime: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    };

    // 🆕 Agregar hash de contraseña si es privada
    if (isPrivate) {
        roomData.passwordHash = await hashPassword(password);
    }

    const roomRef = ref(db, `rooms/${roomId}`);
    await set(roomRef, roomData);

    hideModal();
    showNotification(
        'Sala creada ✅',
        isPrivate ? `"${name}" 🔒 (contraseña: ${password})` : `Se creó "${name}"`
    );
    setTimeout(() => enterRoom(roomId), 500);
}

document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') hideModal();
});

// =============================================
// NOTIFICACIONES DEL NAVEGADOR
// =============================================
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

console.log('💬 ChatApp v2.0 listo - Firebase conectado');