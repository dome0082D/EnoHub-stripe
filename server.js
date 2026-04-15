const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const bcrypt = require('bcrypt');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');

// --- CONFIGURAZIONE CHIAVI ESTERNE ---
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- CONNESSIONE DATABASE CON PROTEZIONE RENDER ---
const MONGO_URI = process.env.MONGO_URI;
if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('✅ EnoHub Infinity 16.0 - Database Connesso'))
        .catch(e => console.log('❌ ERRORE MONGO:', e.message));
} else {
    console.log('⚠️ ATTENZIONE: Variabile MONGO_URI assente su Render. Il sito non salverà i dati.');
}

// --- SCHEMA UTENTE PROFESSIONALE (Tutte le implementazioni richieste) ---
const UserSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String },
    tipo: { type: String, enum: ['Sommelier', 'Cantina'], required: true },
    piano: { type: String, default: "Freemium" }, // Freemium, Pro, Starter, Business, Premium
    googleId: String,
    location: { type: String, default: "Italia" },
    ruolo: { type: String, default: "Wine Professional" },
    bio: { type: String, default: "" },
    specializzazioni: { type: String, default: "" },
    certificazioni: { type: String, default: "" }, // Sigle AIS, WSET ecc.
    certFiles: { type: Map, of: String, default: {} }, // Mappa: { "AIS": "url_file" }
    noteDegustazione: { type: String, default: "" },
    regione: { type: String, default: "" },
    filosofia: { type: String, default: "" },
    sito: { type: String, default: "" },
    storia: { type: String, default: "" },
    unlockedContacts: [String] // Lista ID sommelier sbloccati dalle cantine a 15€
});
const User = mongoose.model('User', UserSchema);

const Message = mongoose.model('Message', new mongoose.Schema({
    from: String, to: String, fromName: String, text: String, fileUrl: String, time: { type: Date, default: Date.now }
}));

const Media = mongoose.model('Media', new mongoose.Schema({
    ownerId: String, url: String, name: String, type: String, date: { type: Date, default: Date.now }
}));

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Cartella Uploads
const uploadDir = path.join(__dirname, 'public/uploads/media');
fs.ensureDirSync(uploadDir);

const upload = multer({ storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
})});

// --- 1. GOOGLE AUTH ---
app.post('/api/google-login', async (req, res) => {
    try {
        const { token } = req.body;
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        let user = await User.findOne({ email: payload.email });
        if(!user) {
            user = new User({ 
                nome: payload.name, email: payload.email, googleId: payload.sub, 
                tipo: 'Sommelier', piano: 'Freemium' 
            });
            await user.save();
        }
        res.json({ success: true, user });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// --- 2. PAGAMENTI REALI STRIPE ---
app.post('/api/create-checkout', async (req, res) => {
    try {
        const { piano, prezzo, type, targetId } = req.body;
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: { currency: 'eur', product_data: { name: `EnoHub Service: ${piano}` }, unit_amount: prezzo * 100 },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${req.headers.origin}/dashboard.html?payment=success&type=${type}&target=${targetId}&piano=${piano}`,
            cancel_url: `${req.headers.origin}/dashboard.html`,
        });
        res.json({ url: session.url });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/confirm-payment', async (req, res) => {
    try {
        const { userId, type, targetId, piano } = req.body;
        let user = await User.findById(userId);
        if(type === 'unlock') {
            if(!user.unlockedContacts.includes(targetId)) user.unlockedContacts.push(targetId);
        } else {
            user.piano = piano;
        }
        await user.save();
        res.json({ success: true, user });
    } catch(e) { res.status(500).json({ success: false }); }
});

// --- 3. MEDIA & SYNC ---
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        const m = new Media({ 
            ownerId: req.body.ownerId, 
            url: '/uploads/media/' + req.file.filename, 
            name: req.file.originalname, 
            type: req.file.mimetype 
        });
        await m.save();
        res.json(m);
    } catch(e) { res.status(500).json({ error: "Upload fallito" }); }
});

app.get('/api/media', async (req, res) => {
    res.json(await Media.find().sort({ date: -1 }));
});

app.delete('/api/media/:id', async (req, res) => {
    const item = await Media.findById(req.params.id);
    if(item) {
        const fullPath = path.join(__dirname, 'public', item.url);
        if(fs.existsSync(fullPath)) fs.removeSync(fullPath);
        await Media.findByIdAndDelete(req.params.id);
    }
    res.json({ success: true });
});

// --- 4. AUTH & USERS ---
app.post('/api/register', async (req, res) => {
    try {
        const hashed = await bcrypt.hash(req.body.password, 10);
        const piano = req.body.tipo === 'Sommelier' ? 'Freemium' : 'Starter';
        const newUser = new User({ ...req.body, password: hashed, piano });
        await newUser.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: "Email già presente" }); }
});

app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (user && await bcrypt.compare(req.body.password, user.password)) {
        res.json({ success: true, user });
    } else { res.status(401).json({ success: false }); }
});

app.get('/api/users', async (req, res) => {
    res.json(await User.find({}, '-password'));
});

app.put('/api/user/:id', async (req, res) => {
    try {
        const updated = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, user: updated });
    } catch(e) { res.status(500).json({ success: false }); }
});

// --- 5. CHAT, NOTIFICHE & STORICO (2 MESI) ---
io.on('connection', (socket) => {
    socket.on('join', (userId) => socket.join(userId));

    socket.on('send_msg', async (data) => {
        const msg = new Message(data);
        await msg.save();
        io.to(data.to).emit('new_msg', msg);
        // Notifica push interna
        io.to(data.to).emit('notification', { 
            title: data.fromName, 
            body: data.fileUrl ? "📎 Allegato Ricevuto" : data.text.substring(0, 30) + "..." 
        });
    });

    socket.on('get_history', async ({ me, to }) => {
        const limiteStorico = new Date();
        limiteStorico.setMonth(limiteStorico.getMonth() - 2); // 60 giorni
        const msgs = await Message.find({
            $or: [{ from: me, to: to }, { from: to, to: me }],
            time: { $gte: limiteStorico }
        }).sort({ time: 1 });
        socket.emit('chat_history', msgs);
    });
});

// --- AVVIO ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 EnoHub 16.0 Gold in esecuzione sulla porta ${PORT}`));

