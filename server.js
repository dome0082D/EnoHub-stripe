const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const bcrypt = require('bcrypt');
const cors = require('cors');
const stripe = require('stripe')('LA_TUA_CHIAVE_SEGRETA_STRIPE');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const MONGO_URI = process.env.MONGO_URI || 'IL_TUO_LINK_ATLAS';
mongoose.connect(MONGO_URI).then(() => console.log('✅ EnoHub 14.0 Gold - DB Connesso'));

// --- SCHEMA TOTALE ---
const User = mongoose.model('User', new mongoose.Schema({
    nome: String, email: { type: String, unique: true }, password: { type: String }, tipo: String,
    piano: { type: String, default: "Freemium" }, googleId: String,
    location: { type: String, default: "Italia" }, bio: { type: String, default: "" },
    specializzazioni: { type: String, default: "" }, certificazioni: { type: String, default: "" },
    noteDegustazione: { type: String, default: "" },
    regione: { type: String, default: "" }, filosofia: { type: String, default: "" },
    sito: { type: String, default: "" }, storia: { type: String, default: "" },
    unlockedContacts: [String] 
}));

const Message = mongoose.model('Message', new mongoose.Schema({
    from: String, to: String, fromName: String, text: String, fileUrl: String, time: { type: Date, default: Date.now }
}));

const Media = mongoose.model('Media', new mongoose.Schema({
    ownerId: String, url: String, name: String, type: String, date: { type: Date, default: Date.now }
}));

app.use(cors()); app.use(express.json()); app.use(express.static('public'));
fs.ensureDirSync('public/uploads/media');

const upload = multer({ storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/media'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
})});

// --- API PAGAMENTI (Sblocco 15€ e Piani) ---
app.post('/api/create-checkout', async (req, res) => {
    const { piano, prezzo, type, targetId, userId } = req.body;
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price_data: { currency: 'eur', product_data: { name: `EnoHub: ${piano}` }, unit_amount: prezzo * 100 }, quantity: 1 }],
        mode: 'payment',
        success_url: `${req.headers.origin}/dashboard.html?payment=success&type=${type}&target=${targetId}&piano=${piano}`,
        cancel_url: `${req.headers.origin}/dashboard.html`,
    });
    res.json({ url: session.url });
});

app.post('/api/confirm-payment', async (req, res) => {
    const { userId, type, targetId, piano } = req.body;
    let user = await User.findById(userId);
    if(type === 'unlock') user.unlockedContacts.push(targetId);
    else user.piano = piano;
    await user.save();
    res.json({ success: true, user });
});

// --- API MEDIA & SYNC CHAT ---
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

// --- AUTH & USERS ---
app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (user && await bcrypt.compare(req.body.password, user.password)) res.json({ success: true, user });
    else res.status(401).json({ success: false });
});
app.post('/api/register', async (req, res) => {
    const hashed = await bcrypt.hash(req.body.password, 10);
    const piano = req.body.tipo === 'Sommelier' ? 'Freemium' : 'Starter';
    const newUser = new User({ ...req.body, password: hashed, piano });
    await newUser.save(); res.json({ success: true });
});
app.put('/api/user/:id', async (req, res) => {
    const updated = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, user: updated });
});
app.get('/api/users', async (req, res) => res.json(await User.find({}, '-password')));

// --- CHAT & NOTIFICHE ---
io.on('connection', (socket) => {
    socket.on('join', (id) => socket.join(id));
    socket.on('send_msg', async (d) => {
        const m = new Message(d); await m.save();
        io.to(d.to).emit('new_msg', m);
        io.to(d.to).emit('notification', { title: d.fromName, body: d.fileUrl ? "Ti ha mandato un file" : d.text });
    });
    socket.on('get_history', async ({ me, to }) => {
        const limit = new Date(); limit.setMonth(limit.getMonth() - 2);
        const msgs = await Message.find({ $or:[{from:me,to:to},{from:to,to:me}], time:{$gte:limit} }).sort({time:1});
        socket.emit('chat_history', msgs);
    });
});

server.listen(process.env.PORT || 3000, () => console.log('🚀 EnoHub Infinity 14.0 Live'));