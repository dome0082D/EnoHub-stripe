const socket = io();
let me = JSON.parse(localStorage.getItem('eno_user'));
let currentChatId = null;

window.onload = () => {
    if (me) {
        socket.emit('join', me._id);
        renderProfile(me);
        loadUsers();
        refreshUI(true);
    }
};

function nav(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function refreshUI(log) {
    document.getElementById('n-chat').style.display = log ? 'block' : 'none';
    document.getElementById('n-prof').style.display = log ? 'block' : 'none';
    document.getElementById('n-out').style.display = log ? 'block' : 'none';
    document.getElementById('auth-panel').style.display = log ? 'none' : 'block';
    document.getElementById('welcome').style.display = log ? 'block' : 'none';
    if(log) document.getElementById('w-name').innerText = `Benvenuto, ${me.name}`;
}

async function login() {
    const email = document.getElementById('l-mail').value;
    const password = document.getElementById('l-pass').value;
    const res = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email, password}) });
    const d = await res.json();
    if(d.success) { localStorage.setItem('eno_user', JSON.stringify(d.user)); location.reload(); }
    else alert("Errore login");
}

async function register() {
    const payload = { name: document.getElementById('r-name').value, email: document.getElementById('r-mail').value, password: document.getElementById('r-pass').value };
    const res = await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    const d = await res.json();
    if(d.success) { localStorage.setItem('eno_user', JSON.stringify(d.user)); location.reload(); }
}

function logout() { localStorage.removeItem('eno_user'); location.reload(); }

// RENDER GRAFICA IDENTICA ALLA FOTO
function renderProfile(u) {
    document.getElementById('p-name').innerText = u.name;
    document.getElementById('p-img').src = u.profilePic;
    document.getElementById('p-title').innerText = u.title;
    document.getElementById('p-loc').innerText = u.location;
    document.getElementById('p-bio').innerText = u.bio;
    
    const status = document.getElementById('p-status');
    status.innerText = u.isAvailable ? "Disponibile per consulenze" : "Non disponibile";
    status.className = "status-tag " + (u.isAvailable ? "status-online" : "status-offline");

    document.getElementById('p-specs').innerHTML = u.specializations?.map(s => `<span class="spec-tag">${s.trim()}</span>`).join('') || '';
    document.getElementById('p-certs').innerHTML = u.certifications?.map(c => `<li><span>${c.trim()}</span></li>`).join('') || '';

    // Popola campi edit
    document.getElementById('e-title').value = u.title;
    document.getElementById('e-loc').value = u.location;
    document.getElementById('e-bio').value = u.bio;
    document.getElementById('e-specs').value = u.specializations?.join(', ') || '';
    document.getElementById('e-certs').value = u.certifications?.join(', ') || '';
    
    const gal = document.getElementById('gallery');
    gal.innerHTML = '';
    u.media.forEach(m => {
        const item = document.createElement('div');
        if(m.fileType.includes('video')) item.innerHTML = `<video src="${m.url}" controls style="width:150px;"></video>`;
        else item.innerHTML = `<img src="${m.url}" style="width:150px;">`;
        item.innerHTML += `<br><button onclick="delMedia('${m.public_id}')" style="background:red; padding:4px;">Elimina</button>`;
        gal.appendChild(item);
    });
}

async function saveProfile() {
    const payload = {
        title: document.getElementById('e-title').value,
        location: document.getElementById('e-loc').value,
        bio: document.getElementById('e-bio').value,
        specializations: document.getElementById('e-specs').value.split(','),
        certifications: document.getElementById('e-certs').value.split(',')
    };
    const res = await fetch(`/api/profile/${me._id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    const upd = await res.json();
    localStorage.setItem('eno_user', JSON.stringify(upd));
    location.reload();
}

function upload() {
    const file = document.getElementById('f-in').files[0];
    const fd = new FormData(); fd.append('file', file);
    const xhr = new XMLHttpRequest();
    document.getElementById('prog-bg').style.display = 'block';
    xhr.upload.onprogress = e => document.getElementById('prog-bar').style.width = Math.round((e.loaded/e.total)*100) + '%';
    xhr.onload = () => { 
        const upd = JSON.parse(xhr.response); 
        localStorage.setItem('eno_user', JSON.stringify(upd)); 
        location.reload(); 
    };
    xhr.open('POST', `/api/upload/${me._id}`); xhr.send(fd);
}

async function delMedia(pid) {
    const res = await fetch(`/api/media/${me._id}`, { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({public_id: pid}) });
    const upd = await res.json();
    localStorage.setItem('eno_user', JSON.stringify(upd));
    location.reload();
}

// CHAT REAL TIME REALE
async function loadUsers() {
    const res = await fetch('/api/users');
    const users = await res.json();
    const list = document.getElementById('u-list');
    list.innerHTML = '';
    users.forEach(u => {
        if(u._id !== me._id) {
            const div = document.createElement('div');
            div.className = 'u-item';
            div.innerHTML = `<img src="${u.profilePic}"> <span>${u.name}</span>`;
            div.onclick = () => startChat(u._id, u.name);
            list.appendChild(div);
        }
    });
}

async function startChat(id, name) {
    currentChatId = id;
    document.getElementById('chat-in').disabled = false;
    document.getElementById('send-btn').disabled = false;
    const res = await fetch(`/api/messages/${me._id}/${id}`);
    const hist = await res.json();
    const area = document.getElementById('msg-area');
    area.innerHTML = `<h4>Chat con ${name}</h4>`;
    hist.forEach(m => appendMsg(m));
}

function sendMsg() {
    const t = document.getElementById('chat-in').value;
    const msg = { senderId: me._id, receiverId: currentChatId, text: t };
    socket.emit('send_msg', msg);
    appendMsg(msg);
    document.getElementById('chat-in').value = '';
}

socket.on('receive_msg', m => { if(m.senderId === currentChatId) appendMsg(m); });

function appendMsg(m) {
    const area = document.getElementById('msg-area');
    const d = document.createElement('div');
    d.className = `msg ${m.senderId === me._id ? 'msg-m' : 'msg-s'}`;
    d.innerText = m.text;
    area.appendChild(d);
    area.scrollTop = area.scrollHeight;
}