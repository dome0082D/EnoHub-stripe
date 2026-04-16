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

// --- CONNESSIONE DATABASE ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ DATABASE: EnoHub Diamond V4 Online'))
    .catch(e => console.log('❌ DB ERROR:', e.message));

// --- SCHEMA UTENTE ---
const User = mongoose.model('User', new mongoose.Schema({
    nome: String, 
    email: { type: String, unique: true }, 
    password: { type: String }, 
    tipo: { type: String }, 
    piano: { type: String, default: "Freemium" },
    location: { type: String, default: "Italia" }, 
    bio: { type: String, default: "" },
    isVerified: { type: Boolean, default: false },
    degustazioni: { type: Array, default: [] },
    unlockedContacts: { type: Array, default: [] },
    blockedUsers: { type: Array, default: [] }, 
    profilePic: { type: String, default: "" },
    vini: { type: Array, default: [] },
    gallery: { type: Array, default: [] }
}));

const Message = mongoose.model('Message', new mongoose.Schema({ 
    from: String, to: String, fromName: String, text: String, fileUrl: String, time: { type: Date, default: Date.now } 
}));

// --- MIDDLEWARE ---
app.use(cors()); 
app.use(express.json());
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

app.post('/api/create-checkout', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price_data: { currency: 'eur', product_data: { name: `EnoHub Upgrade: ${req.body.piano}` }, unit_amount: req.body.prezzo * 100 }, quantity: 1 }],
            mode: 'payment',
            success_url: `${req.headers.origin}/dashboard.html?payment=success&piano=${req.body.piano}&uid=${req.body.userId}`,
            cancel_url: `${req.headers.origin}/dashboard.html`,
        });
        res.json({ url: session.url });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/activate-plan', async (req, res) => {
    try {
        const { userId, piano } = req.body;
        const u = await User.findById(userId);
        if(!u) return res.status(404).json({ success: false });
        u.piano = piano;
        if(piano === "Premium") u.isVerified = true;
        await u.save();
        res.json({ success: true, user: u });
    } catch(e) { res.status(500).json({ success: false }); }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    res.json({ url: '/uploads/media/' + req.file.filename });
});

app.get('/api/users', async (req, res) => res.json(await User.find({}, '-password')));
app.get('/api/user/:id', async (req, res) => res.json(await User.findById(req.params.id, '-password')));

app.get('/api/chats/:id', async (req, res) => {
    try {
        const msgs = await Message.find({ $or: [{ from: req.params.id }, { to: req.params.id }] }).sort({ time: -1 });
        res.json(msgs);
    } catch (e) { res.status(500).json([]); }
});

// --- ADMIN & MODIFICA ---
app.delete('/api/admin/user/:id', async (req, res) => {
    if (req.body.adminEmail !== 'dome0082@gmail.com') return res.status(403).json({ success: false, error: "Accesso negato" });
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/admin/verify', async (req, res) => {
    if (req.body.adminEmail !== 'dome0082@gmail.com') return res.status(403).json({ success: false });
    await User.findByIdAndUpdate(req.body.targetId, { isVerified: req.body.verifyStatus });
    res.json({ success: true });
});

app.put('/api/user/:id', async (req, res) => {
    try {
        const u = await User.findById(req.params.id);
        const isAdmin = req.body.adminEmail === 'dome0082@gmail.com';
        if (!isAdmin && req.body.degustazioni) {
            let limite = u.piano === "Pro" ? 3 : (u.piano === "Premium" ? 10 : 0);
            if (req.body.degustazioni.length > limite) return res.status(403).json({ success: false, error: "Limite raggiunto." });
        }
        Object.assign(u, req.body);
        await u.save(); 
        res.json({ success: true, user: u });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// --- SOCKET.IO CHAT & REGOLA FONDAMENTALE ---
io.on('connection', (socket) => {
    socket.on('join', (id) => socket.join(id));
    
    socket.on('send_msg', async (d) => {
        const sender = await User.findById(d.from);
        const target = await User.findById(d.to);

        if ((sender.blockedUsers && sender.blockedUsers.includes(d.to)) || 
            (target.blockedUsers && target.blockedUsers.includes(d.from))) {
            return socket.emit('chat_error', { error: '🚨 Chat disabilitata per violazione delle regole.' });
        }

        const ruleRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|([+0-9][\s\-]*){8,})/i;
        if (ruleRegex.test(d.text) && sender.email !== 'dome0082@gmail.com') {
            await Message.deleteMany({ $or: [{from: sender._id, to: target._id}, {from: target._id, to: sender._id}] });
            sender.blockedUsers.push(target._id.toString());
            target.blockedUsers.push(sender._id.toString());
            await sender.save(); await target.save();

            socket.emit('chat_error', { error: '🚨 REGOLA VIOLATA: Link o numero rilevato. Chat eliminata.' });
            socket.emit('force_close_chat');
            io.to(d.to).emit('chat_error', { error: `🚨 Chat con ${sender.nome} eliminata dal sistema per violazione policy.` });
            return;
        }

        const m = new Message(d); await m.save();
        io.to(d.to).emit('new_msg', m);
    });

    socket.on('get_history', async ({ me, to }) => {
        const msgs = await Message.find({ $or:[{from:me,to:to},{from:to,to:me}] }).sort({time:1});
        socket.emit('chat_history', msgs);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 EnoHub V4 Online sulla porta ${PORT}`));
