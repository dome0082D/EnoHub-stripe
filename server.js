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
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Inizializzazione Google Client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// --- CONNESSIONE DATABASE (Con Log di Sicurezza) ---
const MONGO_URI = process.env.MONGO_URI;
if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('✅ DATABASE: Connesso con successo (EnoHub Infinity)'))
        .catch(e => console.log('❌ DATABASE ERROR:', e.message));
} else {
    console.log('⚠️ ALERT: Variabile MONGO_URI non trovata. Il database non funzionerà.');
}

// --- SCHEMA UTENTE (Sommelier + Cantina + Stripe + Google) ---
const User = mongoose.model('User', new mongoose.Schema({
    nome: String, email: { type: String, unique: true }, password: { type: String }, tipo: String,
    piano: { type: String, default: "Freemium" }, 
    googleId: String,
    location: { type: String, default: "Italia" }, 
    bio: { type: String, default: "" },
    ruolo: { type: String, default: "Wine Professional" },
    specializzazioni: { type: String, default: "" }, 
    certificazioni: { type: String, default: "" },
    noteDegustazione: { type: String, default: "" },
    regione: { type: String, default: "" }, 
    filosofia: { type: String, default: "" },
    sito: { type: String, default: "" }, 
    storia: { type: String, default: "" },
    unlockedContacts: [String] // ID degli utenti sbloccati via Pay-per-Match
}));

const Message = mongoose.model('Message', new mongoose.Schema({
    from: String, to: String, fromName: String, text: String, fileUrl: String, time: { type: Date, default: Date.now }
}));

const Media = mongoose.model('Media', new mongoose.Schema({
    ownerId: String, url: String, name: String, type: String, date: { type: Date, default: Date.now }
}));

// --- MIDDLEWARE & CONFIG ---
app.use(cors()); app.use(express.json()); app.use(express.static('public'));
fs.ensureDirSync('public/uploads/media');

const upload = multer({ storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/media'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
})});

// --- 1. GOOGLE LOGIN API ---
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
                nome: payload.name, 
                email: payload.email, 
                googleId: payload.sub, 
                tipo: 'Sommelier', // Default per nuovi utenti Google
                piano: 'Freemium'
            });
            await user.save();
        }
        res.json({ success: true, user });
    } catch (e) {
        res.status(500).json({ success: false, error: "Errore autenticazione Google" });
    }
});

// --- 2. API PAGAMENTI (STRIPE) ---
app.post('/api/create-checkout', async (req, res) => {
    try {
        const { piano, prezzo, type, targetId, userId } = req.body;
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: { 
                    currency: 'eur', 
                    product_data: { name: `EnoHub Service: ${piano}` }, 
                    unit_amount: prezzo * 100 
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${req.headers.origin}/dashboard.html?payment=success&type=${type}&target=${targetId}&piano=${piano}`,
            cancel_url: `${req.headers.origin}/dashboard.html`,
        });
        res.json({ url: session.url });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/confirm-payment', async (req, res) => {
    const { userId, type, targetId, piano } = req.body;
    let user = await User.findById(userId);
    if(type === 'unlock') {
        if(!user.unlockedContacts.includes(targetId)) user.unlockedContacts.push(targetId);
    } else {
        user.piano = piano;
    }
    await user.save();
    res.json({ success: true, user });
});

// --- 3. GESTIONE MEDIA & SYNC ---
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
    } catch(e) { res.status(500).json({error: "Errore upload"}); }
});

app.get('/api/media', async (req, res) => {
    const items = await Media.find().sort({date: -1});
    res.json(items);
});

app.delete('/api/media/:id', async (req, res) => {
    const item = await Media.findById(req.params.id);
    if(item) {
        const filePath = path.join(__dirname, 'public', item.url);
        if(fs.existsSync(filePath)) fs.removeSync(filePath);
        await Media.findByIdAndDelete(req.params.id);
    }
    res.json({ success: true });
});

// --- 4. AUTH STANDARD & USERS ---
app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (user && await bcrypt.compare(req.body.password, user.password)) {
        res.json({ success: true, user });
    } else {
        res.status(401).json({ success: false });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const hashed = await bcrypt.hash(req.body.password, 10);
        const pianoDefault = req.body.tipo === 'Sommelier' ? 'Freemium' : 'Starter';
        const newUser = new User({ ...req.body, password: hashed, piano: pianoDefault });
        await newUser.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: "Email esistente" });
    }
});

app.put('/api/user/:id', async (req, res) => {
    const updated = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, user: updated });
});

app.get('/api/users', async (req, res) => {
    const users = await User.find({}, '-password');
    res.json(users);
});

// --- 5. CHAT, ARCHIVIO (2 MESI) & NOTIFICHE ---
io.on('connection', (socket) => {
    socket.on('join', (userId) => socket.join(userId));

    socket.on('send_msg', async (data) => {
        const msg = new Message(data);
        await msg.save();
        
        // Invia il messaggio al destinatario
        io.to(data.to).emit('new_msg', msg);
        
        // Invia notifica Push per far suonare la campanella
        io.to(data.to).emit('notification', { 
            title: data.fromName, 
            body: data.fileUrl ? "📎 Ti ha inviato un allegato" : data.text.substring(0, 40) + "..."
        });
    });

    socket.on('get_history', async ({ me, to }) => {
        const dueMesiFa = new Date();
        dueMesiFa.setMonth(dueMesiFa.getMonth() - 2);
        
        const history = await Message.find({
            $or: [
                { from: me, to: to },
                { from: to, to: me }
            ],
            time: { $gte: dueMesiFa } // Filtro storico 60 giorni
        }).sort({ time: 1 });
        
        socket.emit('chat_history', history);
    });
});

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 EnoHub Infinity 15.0 Gold attiva su porta ${PORT}`));
