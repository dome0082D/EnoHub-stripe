const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const bcrypt = require('bcrypt');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ DATABASE: EnoHub Diamond v4 Online'))
    .catch(e => console.log('❌ DB ERROR:', e.message));

// --- SCHEMA UTENTE ---
const User = mongoose.model('User', new mongoose.Schema({
    nome: String, email: { type: String, unique: true }, password: { type: String }, tipo: String,
    piano: { type: String, default: "Freemium" },
    location: { type: String, default: "Italia" }, bio: { type: String, default: "" },
    isVerified: { type: Boolean, default: false }, // LA SPUNTA VERDE
    degustazioni: { type: Array, default: [] },
    unlockedContacts: { type: Array, default: [] }
}));

const Message = mongoose.model('Message', new mongoose.Schema({ from: String, to: String, fromName: String, text: String, fileUrl: String, time: { type: Date, default: Date.now } }));

app.use(cors()); 
app.use(express.json()); 

// --- FIX ALLEGATI: PERMETTE DI LEGGERE I FILE CARICATI ---
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

fs.ensureDirSync('public/uploads/media');

const upload = multer({ storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/media'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
})});

// --- ROTTE API ---
app.post('/api/login', async (req, res) => {
    const email = req.body.email.toLowerCase().trim();
    const u = await User.findOne({ email });
    if (u && await bcrypt.compare(req.body.password, u.password)) res.json({ success: true, user: u });
    else res.status(401).json({ success: false });
});

// --- ROTTE STAFF (VERIFICA ACCOUNT) ---
app.get('/api/users', async (req, res) => res.json(await User.find({}, '-password')));

app.post('/api/admin/verify', async (req, res) => {
    // Controllo sicurezza email admin
    if(req.body.adminEmail !== 'dome0082@gmail.com') return res.status(403).json({ success: false });
    const target = await User.findById(req.body.targetId);
    if(target) {
        target.isVerified = req.body.verifyStatus;
        await target.save();
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
    }
});

// --- ARCHIVIO DEGUSTAZIONI ---
app.get('/api/user/:id/degustazioni', async (req, res) => {
    const u = await User.findById(req.params.id);
    res.json(u.degustazioni || []);
});

app.post('/api/user/:id/degustazioni', async (req, res) => {
    const u = await User.findById(req.params.id);
    u.degustazioni.push({ ...req.body, date: new Date() });
    await u.save();
    res.json({ success: true });
});

// --- CHAT SOCKET.IO ---
io.on('connection', (socket) => {
    socket.on('join', (id) => socket.join(id));
    socket.on('send_msg', async (d) => {
        const m = new Message(d); await m.save();
        io.to(d.to).emit('new_msg', m);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 EnoHub V4 Online su porta ${PORT}`));