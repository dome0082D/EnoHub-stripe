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
    .then(() => console.log('✅ DATABASE: EnoHub Online'))
    .catch(e => console.log('❌ DB ERROR:', e.message));

const User = mongoose.model('User', new mongoose.Schema({
    nome: String, email: { type: String, unique: true }, password: { type: String }, tipo: String,
    piano: { type: String, default: "Freemium" },
    location: { type: String, default: "Italia" }, bio: { type: String, default: "" },
    isVerified: { type: Boolean, default: false },
    degustazioni: { type: Array, default: [] },
    unlockedContacts: { type: Array, default: [] }
}));

const Message = mongoose.model('Message', new mongoose.Schema({ from: String, to: String, fromName: String, text: String, fileUrl: String, time: { type: Date, default: Date.now } }));

app.use(cors()); app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

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
            success_url: `${req.headers.origin}/dashboard.html?payment=success`,
            cancel_url: `${req.headers.origin}/dashboard.html`,
        });
        res.json({ url: session.url });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    res.json({ url: '/uploads/media/' + req.file.filename });
});

app.get('/api/users', async (req, res) => res.json(await User.find({}, '-password')));
app.get('/api/user/:id', async (req, res) => res.json(await User.findById(req.params.id, '-password')));
app.put('/api/user/:id', async (req, res) => {
    const u = await User.findById(req.params.id);
    Object.assign(u, req.body);
    await u.save(); res.json({ success: true, user: u });
});

app.post('/api/admin/verify', async (req, res) => {
    if(req.body.adminEmail !== 'dome0082@gmail.com') return res.status(403).json({ success: false });
    await User.findByIdAndUpdate(req.body.targetId, { isVerified: req.body.verifyStatus });
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 EnoHub V4 Online`));
