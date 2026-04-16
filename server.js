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

const User = mongoose.model('User', new mongoose.Schema({
    nome: String, email: { type: String, unique: true }, password: { type: String }, tipo: String,
    piano: { type: String, default: "Freemium" },
    location: { type: String, default: "Italia" }, bio: { type: String, default: "" },
    ruolo: { type: String, default: "Wine Professional" },
    specializzazioni: { type: String, default: "" }, certificazioni: { type: String, default: "" }, 
    certFiles: { type: Object, default: {} }, 
    degustazioni: { type: Array, default: [] },
    regione: { type: String, default: "" }, filosofia: { type: String, default: "" }, 
    storia: { type: String, default: "" }, sito: { type: String, default: "" },
    unlockedContacts: { type: Array, default: [] }, 
    unlocksRemaining: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false }, identificativoCertificato: { type: String, default: "" }
}));

const Message = mongoose.model('Message', new mongoose.Schema({ from: String, to: String, fromName: String, text: String, fileUrl: String, time: { type: Date, default: Date.now } }));
const Media = mongoose.model('Media', new mongoose.Schema({ ownerId: String, url: String, name: String, type: String, date: { type: Date, default: Date.now } }));

app.use(cors()); app.use(express.json()); app.use(express.static('public'));
fs.ensureDirSync('public/uploads/media');

const upload = multer({ storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/media'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
})});

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
            line_items: [{ price_data: { currency: 'eur', product_data: { name: `EnoHub: ${req.body.piano}` }, unit_amount: req.body.prezzo * 100 }, quantity: 1 }],
            mode: 'payment',
            success_url: `${req.headers.origin}/dashboard.html?payment=success&type=${req.body.type}&target=${req.body.targetId || ''}&piano=${req.body.piano}`,
            cancel_url: `${req.headers.origin}/dashboard.html`,
        });
        res.json({ url: session.url });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/confirm-payment', async (req, res) => {
    const u = await User.findById(req.body.userId);
    if(req.body.type === 'unlock') {
        if(!u.unlockedContacts.includes(req.body.targetId)) u.unlockedContacts.push(req.body.targetId);
    } else {
        u.piano = req.body.piano;
        if(u.tipo === 'Cantina' && req.body.piano === 'Business') u.unlocksRemaining = 5;
    }
    await u.save(); res.json({ success: true, user: u });
});

app.get('/api/users', async (req, res) => res.json(await User.find({}, '-password')));
app.get('/api/user/:id', async (req, res) => res.json(await User.findById(req.params.id, '-password')));

app.put('/api/user/:id', async (req, res) => {
    const u = await User.findById(req.params.id);
    Object.assign(u, req.body);
    if(req.body.certFiles) u.markModified('certFiles');
    await u.save();
    res.json({ success: true, user: u });
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    const m = new Media({ ownerId: req.body.ownerId, url: '/uploads/media/'+req.file.filename, name: req.file.originalname, type: req.file.mimetype });
    await m.save(); res.json(m);
});

app.get('/api/media', async (req, res) => res.json(await Media.find().sort({date:-1})));
app.delete('/api/media/:id', async (req, res) => {
    const item = await Media.findById(req.params.id);
    if(item && item.url) { 
        const p = path.join(__dirname, 'public', item.url);
        if(fs.existsSync(p)) fs.unlinkSync(p);
    }
    await Media.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.post('/api/admin/verify', async (req, res) => {
    if(req.body.adminEmail !== 'dome0082@gmail.com') return res.status(403).json({ success: false });
    const target = await User.findById(req.body.targetId);
    target.isVerified = req.body.verifyStatus;
    await target.save(); res.json({ success: true });
});

app.delete('/api/admin/delete-user', async (req, res) => {
    if(req.body.adminEmail !== 'dome0082@gmail.com') return res.status(403).json({ success: false });
    await User.findByIdAndDelete(req.body.targetId);
    res.json({ success: true });
});

io.on('connection', (socket) => {
    socket.on('join', (id) => socket.join(id));
    socket.on('send_msg', async (d) => {
        const m = new Message(d); await m.save();
        io.to(d.to).emit('new_msg', m);
    });
    socket.on('get_history', async ({ me, to }) => {
        const msgs = await Message.find({ $or:[{from:me,to:to},{from:to,to:me}] }).sort({time:1});
        socket.emit('chat_history', msgs);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server EnoHub V4 Pronto sulla porta ${PORT}`));
