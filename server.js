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
// Se su Render non hai impostato la chiave STRIPE_SECRET_KEY, questa finta chiave darà errore (e ora lo vedrai nello schermo)
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder_error');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ DATABASE: EnoHub Diamond V2 Staff-Ready'))
    .catch(e => console.log('❌ DATABASE ERROR:', e.message));

// SCHEMA UTENTE
const User = mongoose.model('User', new mongoose.Schema({
    nome: String, email: { type: String, unique: true }, password: { type: String }, tipo: String,
    piano: { type: String, default: "Freemium" }, googleId: String,
    location: { type: String, default: "Italia" }, bio: { type: String, default: "" },
    ruolo: { type: String, default: "Wine Professional" },
    specializzazioni: { type: String, default: "" }, certificazioni: { type: String, default: "" }, 
    certFiles: { type: Map, of: String, default: {} },
    noteDegustazione: { type: String, default: "" }, tastingLabelUrl: { type: String, default: "" },
    premiumText: { type: String, default: "" }, premiumImageUrl: { type: String, default: "" },
    regione: { type: String, default: "" }, filosofia: { type: String, default: "" }, 
    storia: { type: String, default: "" }, sito: { type: String, default: "" },
    unlockedContacts: [String], following: [String],
    unlocksRemaining: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false }, identificativoCertificato: { type: String, default: "" }
}));

const Message = mongoose.model('Message', new mongoose.Schema({ from: String, to: String, fromName: String, text: String, fileUrl: String, time: { type: Date, default: Date.now } }));
const Media = mongoose.model('Media', new mongoose.Schema({ ownerId: String, url: String, name: String, type: String, date: { type: Date, default: Date.now } }));

app.use(cors()); app.use(express.json()); app.use(express.static('public'));
fs.ensureDirSync('public/uploads/media');

const upload = multer({ storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/media'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
})});

// AUTH
app.post('/api/google-login', async (req, res) => {
    try {
        const ticket = await googleClient.verifyIdToken({ idToken: req.body.token, audience: process.env.GOOGLE_CLIENT_ID });
        const p = ticket.getPayload();
        let u = await User.findOne({ email: p.email });
        if(!u) { u = new User({ nome: p.name, email: p.email, googleId: p.sub, tipo: 'Sommelier', piano: 'Freemium' }); await u.save(); }
        res.json({ success: true, user: u });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/login', async (req, res) => {
    const email = req.body.email.toLowerCase().trim();
    const u = await User.findOne({ email });
    if (u && await bcrypt.compare(req.body.password, u.password)) res.json({ success: true, user: u });
    else res.status(401).json({ success: false });
});

app.post('/api/register', async (req, res) => {
    try {
        const email = req.body.email.toLowerCase().trim();
        const hashed = await bcrypt.hash(req.body.password, 10);
        const u = new User({ ...req.body, email, password: hashed, piano: (req.body.tipo==='Cantina'?'Starter':'Freemium') });
        await u.save(); res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false }); }
});

// STAFF ADMIN
app.post('/api/admin/delete-user', async (req, res) => {
    if(req.body.adminEmail !== 'dome0082@gmail.com') return res.status(403).json({ success: false });
    await User.findByIdAndDelete(req.body.targetId);
    await Media.deleteMany({ ownerId: req.body.targetId });
    res.json({ success: true });
});

app.post('/api/admin/verify', async (req, res) => {
    if(req.body.adminEmail !== 'dome0082@gmail.com') return res.status(403).json({ success: false });
    const target = await User.findById(req.body.targetId);
    target.isVerified = req.body.verifyStatus;
    if(target.isVerified && !target.identificativoCertificato) {
        target.identificativoCertificato = 'EH-STAFF-' + Math.floor(1000 + Math.random() * 9000);
    }
    await target.save(); res.json({ success: true });
});

// STRIPE E CREDITI
app.post('/api/create-checkout', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price_data: { currency: 'eur', product_data: { name: `EnoHub: ${req.body.piano}` }, unit_amount: req.body.prezzo * 100 }, quantity: 1 }],
            mode: 'payment',
            success_url: `${req.headers.origin}/dashboard.html?payment=success&type=${req.body.type}&target=${req.body.targetId || ''}&piano=${req.body.piano}`,
            cancel_url: `${req.headers.origin}/dashboard.html`,
        });
        res.json({ url: session.url });
    } catch(e) { 
        console.error("ERRORE STRIPE:", e.message); // Questo lo vedi nei log di Render
        res.status(500).json({ error: e.message }); // Questo lo mandiamo al front-end
    }
});

app.post('/api/confirm-payment', async (req, res) => {
    const u = await User.findById(req.body.userId);
    if(req.body.type === 'unlock') {
        if(!u.unlockedContacts.includes(req.body.targetId)) u.unlockedContacts.push(req.body.targetId);
    } else {
        u.piano = req.body.piano;
        if(u.tipo === 'Cantina' && req.body.piano === 'Business') { u.unlocksRemaining = 5; }
        if(u.tipo === 'Sommelier' && req.body.piano === 'Pro' && !u.identificativoCertificato) {
            u.identificativoCertificato = 'EH-SOM-' + Math.floor(1000 + Math.random() * 9000);
        }
    }
    await u.save(); res.json({ success: true, user: u });
});

app.post('/api/use-credit', async (req, res) => {
    const u = await User.findById(req.body.userId);
    if(u.unlocksRemaining > 0 && !u.unlockedContacts.includes(req.body.targetId)) {
        u.unlocksRemaining -= 1; u.unlockedContacts.push(req.body.targetId);
        await u.save(); res.json({ success: true, user: u });
    } else { res.json({ success: false }); }
});

// TAKE OUT E MEDIA
app.delete('/api/user/:id', async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    await Media.deleteMany({ ownerId: req.params.id });
    res.json({ success: true });
});

app.get('/api/users', async (req, res) => res.json(await User.find({}, '-password')));
app.get('/api/user/:id', async (req, res) => res.json(await User.findById(req.params.id, '-password')));
app.put('/api/user/:id', async (req, res) => {
    const u = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, user: u });
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    const m = new Media({ ownerId: req.body.ownerId, url: '/uploads/media/'+req.file.filename, name: req.file.originalname, type: req.file.mimetype });
    await m.save(); res.json(m);
});
app.get('/api/media', async (req, res) => res.json(await Media.find().sort({date:-1})));
app.delete('/api/media/:id', async (req, res) => {
    const item = await Media.findById(req.params.id);
    if(item) { fs.removeSync(path.join(__dirname, 'public', item.url)); await Media.findByIdAndDelete(req.params.id); }
    res.json({ success: true });
});

// CHAT E NOTIFICHE
io.on('connection', (socket) => {
    socket.on('join', (id) => socket.join(id));
    socket.on('send_msg', async (d) => {
        const m = new Message(d); await m.save();
        io.to(d.to).emit('new_msg', m);
        io.to(d.to).emit('notification', { title: d.fromName, body: d.text || "📎 File ricevuto" });
    });
    socket.on('get_history', async ({ me, to }) => {
        const limit = new Date(); limit.setMonth(limit.getMonth() - 2);
        const msgs = await Message.find({ $or:[{from:me,to:to},{from:to,to:me}], time:{$gte:limit} }).sort({time:1});
        socket.emit('chat_history', msgs);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 EnoHub DIAMOND STAFF MODE Active on ${PORT}`));