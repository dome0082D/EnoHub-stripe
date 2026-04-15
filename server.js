const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const bcrypt = require('bcrypt');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// DB CONNECTION
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost/enohub')
    .then(() => console.log('✅ DATABASE: EnoHub Connesso'))
    .catch(e => console.log('❌ DATABASE ERROR:', e.message));

// USER SCHEMA
const User = mongoose.model('User', new mongoose.Schema({
    nome: String, email: { type: String, unique: true }, password: { type: String }, tipo: String,
    piano: { type: String, default: "Freemium" },
    bio: { type: String, default: "" }, ruolo: { type: String, default: "Sommelier" },
    certificazioni: { type: String, default: "" }, noteDegustazione: { type: String, default: "" },
    regione: { type: String, default: "" }, storia: { type: String, default: "" },
    sito: { type: String, default: "" }
}));

app.use(cors()); app.use(express.json()); app.use(express.static('public'));

// AUTH: LOGIN (Risolto problema login)
app.post('/api/login', async (req, res) => {
    try {
        const emailNorm = req.body.email.toLowerCase().trim();
        console.log(`🔑 Tentativo login: ${emailNorm}`);
        const u = await User.findOne({ email: emailNorm });
        if (u && await bcrypt.compare(req.body.password, u.password)) {
            console.log("✅ Successo!");
            res.json({ success: true, user: u });
        } else {
            console.log("❌ Fallito: credenziali errate");
            res.status(401).json({ success: false });
        }
    } catch(e) { res.status(500).json({ success: false }); }
});

app.post('/api/register', async (req, res) => {
    try {
        const emailNorm = req.body.email.toLowerCase().trim();
        const hashed = await bcrypt.hash(req.body.password, 10);
        const u = new User({ ...req.body, email: emailNorm, password: hashed });
        await u.save(); res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false }); }
});

// API USER UPDATE
app.put('/api/user/:id', async (req, res) => {
    const u = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, user: u });
});

// CHAT REAL-TIME
io.on('connection', (socket) => {
    socket.on('join', (id) => socket.join(id));
    socket.on('send_msg', (d) => io.to(d.to).emit('new_msg', d));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 EnoHub Attivo sulla porta ${PORT}`));