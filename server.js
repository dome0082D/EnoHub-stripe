require('dotenv').config()
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

// --- SCHEMA UTENTE (VERSIONE INTEGRALE) ---
const User = mongoose.model('User', new mongoose.Schema({
    nome: String, 
    email: { type: String, unique: true }, 
    password: { type: String }, 
    tipo: { type: String }, // 'Cantina' o 'Sommelier'
    piano: { type: String, default: "Freemium" },
    location: { type: String, default: "Italia" }, 
    bio: { type: String, default: "" },
    isVerified: { type: Boolean, default: false },
    degustazioni: { type: Array, default: [] },
    unlockedContacts: { type: Array, default: [] },
    
    // Campi per Profili Differenziati
    profilePic: { type: String, default: "" }, // Foto profilo (Sommelier) o Logo (Cantina)
    vini: { type: Array, default: [] }, // Tabella vini (solo Cantina)
    gallery: { type: Array, default: [] } // Archivio immagini (solo Cantina)
}));

const Message = mongoose.model('Message', new mongoose.Schema({ 
    from: String, 
    to: String, 
    fromName: String, 
    text: String, 
    fileUrl: String, 
    time: { type: Date, default: Date.now } 
}));

// --- CONFIGURAZIONE MIDDLEWARE ---
app.use(cors()); 
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Configurazione Cartelle Upload
fs.ensureDirSync('public/uploads/media');
const upload = multer({ storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/media'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
})});

// --- ROTTE API ---

// Login
app.post('/api/login', async (req, res) => {
    const email = req.body.email.toLowerCase().trim();
    const u = await User.findOne({ email });
    if (u && await bcrypt.compare(req.body.password, u.password)) res.json({ success: true, user: u });
    else res.status(401).json({ success: false });
});

// Pagamenti Stripe (Upgrade Piano)
app.post('/api/create-checkout', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ 
                price_data: { 
                    currency: 'eur', 
                    product_data: { name: `EnoHub Upgrade: ${req.body.piano}` }, 
                    unit_amount: req.body.prezzo * 100 
                }, 
                quantity: 1 
            }],
            mode: 'payment',
            success_url: `${req.headers.origin}/dashboard.html?payment=success&piano=${req.body.piano}&uid=${req.body.userId}`,
            cancel_url: `${req.headers.origin}/dashboard.html`,
        });
        res.json({ url: session.url });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Attivazione Automatica Piano e Spunta EH ✅ (Per Premium)
app.post('/api/activate-plan', async (req, res) => {
    try {
        const { userId, piano } = req.body;
        const u = await User.findById(userId);
        if(!u) return res.status(404).json({ success: false });

        u.piano = piano;
        // Se il piano è Premium, attiva la verifica automatica dello staff
        if(piano === "Premium") u.isVerified = true;
        
        await u.save();
        res.json({ success: true, user: u });
    } catch(e) { res.status(500).json({ success: false }); }
});

// Upload File (Foto, Loghi, Galleria)
app.post('/api/upload', upload.single('file'), async (req, res) => {
    res.json({ url: '/uploads/media/' + req.file.filename });
});

// Get Dati Utenti
app.get('/api/users', async (req, res) => res.json(await User.find({}, '-password')));
app.get('/api/user/:id', async (req, res) => res.json(await User.findById(req.params.id, '-password')));

// Salvataggio Profilo con Controllo Limiti Degustazioni
app.put('/api/user/:id', async (req, res) => {
    try {
        const u = await User.findById(req.params.id);
        
        // Logica Limiti Note di Degustazione
        if(req.body.degustazioni) {
            let limite = 0; // Freemium
            if(u.piano === "Pro") limite = 3;
            if(u.piano === "Premium") limite = 10;
            
            // Bypass per l'admin staff
            if(u.email !== 'dome0082@gmail.com' && req.body.degustazioni.length > limite) {
                return res.status(403).json({ 
                    success: false, 
                    error: `Il tuo piano ${u.piano} permette massimo ${limite} note di degustazione.` 
                });
            }
        }

        Object.assign(u, req.body);
        await u.save(); 
        res.json({ success: true, user: u });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Admin: Verifica Manuale Staff
app.post('/api/admin/verify', async (req, res) => {
    if(req.body.adminEmail !== 'dome0082@gmail.com') return res.status(403).json({ success: false });
    await User.findByIdAndUpdate(req.body.targetId, { isVerified: req.body.verifyStatus });
    res.json({ success: true });
});

// --- CHAT CON CONTROLLO LIMITI PIANI (SOCKET.IO) ---
io.on('connection', (socket) => {
    socket.on('join', (id) => socket.join(id));
    
    socket.on('send_msg', async (d) => {
        const sender = await User.findById(d.from);
        const target = await User.findById(d.to);

        // Controllo limiti se il mittente NON è admin staff
        if(sender.email !== 'dome0082@gmail.com' && target.tipo === 'Cantina') {
            // Conta quante cantine DIVERSE ha contattato l'utente
            const history = await Message.find({ from: sender._id });
            const cantineContattate = [...new Set(history.map(m => m.to.toString()))];

            let maxCantine = 0; // Freemium
            if(sender.piano === "Pro") maxCantine = 1;
            if(sender.piano === "Premium") maxCantine = 3;

            // Se l'utente prova a scrivere a una cantina nuova e ha finito i bonus: blocca
            if(!cantineContattate.includes(d.to.toString()) && cantineContattate.length >= maxCantine) {
                return socket.emit('chat_error', { 
                    error: `Il tuo piano ${sender.piano} permette di contattare massimo ${maxCantine} cantine.` 
                });
            }
        }

        const m = new Message(d); 
        await m.save();
        io.to(d.to).emit('new_msg', m);
    });

    socket.on('get_history', async ({ me, to }) => {
        const msgs = await Message.find({ $or:[{from:me,to:to},{from:to,to:me}] }).sort({time:1});
        socket.emit('chat_history', msgs);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 EnoHub V4 Online sulla porta ${PORT}`));