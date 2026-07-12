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

// Inicializar Firebase
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

// =============================================
// LOGIN
// =============================================
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');

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

    // Contador de usuarios online
    const presenceRef = ref(db, 'presence');
    onValue(presenceRef, (snap) => {
        const count = snap.numChildren() || 0;
        const el = document.getElementById('online-num');
        if (el) el.textContent = count;
    });

    // Barra de conexión
    onValue(connectedRef, (snap) => {
        const bar = document.getElementById('connection-bar');
        if (!snap.val()) bar.classList.add('show');
        else bar.classList.remove('show');
    });
}

// =============================================
// SALAS
// =============================================
async function loadRooms() {
    // Crear salas por defecto si no existen
    for (const room of DEFAULT_ROOMS) {
        const roomRef = ref(db, `rooms/${room.id}`);
        const snap = await get(roomRef);
        if (!snap.exists()) {
            await set(roomRef, {
                name: room.name,
                icon: room.icon,
                color: room.color,
                createdBy: 'system',
                createdAt: serverTimestamp()
            });
        }
    }

    // Escuchar todas las salas
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
        return `
            <div class="room-item ${isActive ? 'active' : ''}" onclick="window.openRoom('${id}')">
                <div class="room-icon" style="background:${bg}22; color:${bg};">
                    ${room.icon || '💬'}
                </div>
                <div class="room-info">
                    <div class="room-name">${escapeHtml(room.name)}</div>
                    <div class="room-preview">${escapeHtml(room.lastMessage || 'Sin mensajes aún')}</div>
                </div>
                <div class="room-meta">
                    <div class="room-time">${room.lastTime || ''}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Exponer al window para el onclick en HTML
window.openRoom = openRoom;

function openRoom(roomId) {
    currentRoom = roomId;
    const room = roomsData[roomId];
    if (!room) return;

    document.getElementById('empty-state').style.display = 'none';
    const activeChat = document.getElementById('active-chat');
    activeChat.classList.add('active');

    document.getElementById('chat-room-name').textContent = room.name;
    document.getElementById('chat-room-icon').textContent = room.icon || '💬';
    document.getElementById('chat-room-icon').style.background = `${room.color || '#6c5ce7'}22`;
    document.getElementById('chat-room-members').textContent = 'Sala de chat';

    // Mobile: ocultar sidebar
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

document.getElementById('mobile-back').addEventListener('click', showSidebar);

// =============================================
// MENSAJES
// =============================================
function loadMessages(roomId) {
    // Limpiar listeners anteriores
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

        // Si hay mensajes nuevos y ya estábamos en la sala, reproducir sonido
        if (previousMsgCount > 0 && messages.length > previousMsgCount) {
            const newMsg = messages[messages.length - 1];
            if (newMsg.uid !== currentUser.uid) {
                playNotifSound();
            }
        }
        previousMsgCount = messages.length;

        container.scrollTop = container.scrollHeight;
    });

    // Typing indicator
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
// ENVIAR MENSAJE
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
    // Auto resize
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

    // Actualizar preview de la sala
    const preview = text.length > 40 ? text.substring(0, 40) + '...' : text;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

    const roomRef = ref(db, `rooms/${currentRoom}`);
    update(roomRef, {
        lastMessage: `${currentUser.name}: ${preview}`,
        lastTime: timeStr
    });

    // Limpiar typing
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
// EMOJIS
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
// MODAL NUEVA SALA
// =============================================
document.getElementById('add-room-btn').addEventListener('click', () => {
    document.getElementById('modal-overlay').classList.add('show');
    document.getElementById('room-name-input').focus();
});

document.getElementById('btn-cancel').addEventListener('click', hideModal);

document.getElementById('btn-confirm').addEventListener('click', createRoom);

document.getElementById('room-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createRoom();
});

function hideModal() {
    document.getElementById('modal-overlay').classList.remove('show');
    document.getElementById('room-name-input').value = '';
    document.getElementById('room-icon-input').value = '';
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

    const roomId = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    const color = getRandomColor();

    const roomRef = ref(db, `rooms/${roomId}`);
    await set(roomRef, {
        name: name,
        icon: icon,
        color: color,
        createdBy: currentUser.name,
        createdAt: serverTimestamp(),
        lastMessage: 'Sala creada',
        lastTime: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    });

    hideModal();
    showNotification('Sala creada ✅', `Se creó "${name}"`);
    setTimeout(() => openRoom(roomId), 500);
}

// Cerrar modal al hacer click fuera
document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') hideModal();
});

// =============================================
// NOTIFICACIONES DEL NAVEGADOR
// =============================================
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

console.log('💬 ChatApp listo - Firebase conectado');