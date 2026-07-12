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

let currentUser = null;
let currentRoom = null;
let messagesUnsubscribe = null;
let typingUnsubscribe = null;
let typingTimeout = null;
let roomsData = {};
let previousMsgCount = 0;
let pendingPrivateRoomId = null;

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

const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const rememberCheckbox = document.getElementById('remember-checkbox');

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
        alert('Error al conectar: ' + err.message);
    }
}

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

async function loadRooms() {
    for (const room of DEFAULT_ROOMS) {
        const roomRef = ref(db, `rooms/${room.id}`);
        const snap = await get(roomRef);
        if (!snap.exists()) {
            await set(room
