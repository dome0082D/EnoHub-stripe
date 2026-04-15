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

// Inizializzazione Stripe (assicurati di impostare STRIPE_SECRET_KEY su Render)
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_fallback');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Inizializzazione Google Client (assicurati di impostare GOOGLE_CLIENT_ID su Render)
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// --- CONNESSIONE DATABASE (Con Protezione Anti-Crash) ---
const MONGO_URI = process.env.MONGO_URI;
if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('✅ DATABASE: Connesso con successo (EnoHub 16.0)'))
        .catch(e => console.log('❌ DATABASE ERROR:', e.message));
} else {
    console.log('⚠️ ALERT: Variabile MONGO_URI non trovata su Render! Inseriscila in Environment per farlo funzionare.');
}

// --- SCHEMI DATABASE PROFESSIONALI ---
const User = mongoose.model('User', new mongoose.Schema({
    nome: String, 
    email: { type: String, unique: true }, 
    password: { type: String }, 
    tipo: String,
    piano: { type: String, default: "Freemium" }, 
    googleId: String,
    location: { type: String, default: "Italia" }, 
    bio: { type: String, default: "" },
    ruolo: { type: String, default: "Wine Professional" },
    specializzazioni: { type: String, default: "" }, 
    certificazioni: { type: String, default: "" }, // Le sigle separate da virgola (es. AIS, WSET)
    certFiles: { type: Map, of: String }, // Mappa per i file PDF/Immagini delle 8 certificazioni
    noteDegustazione: { type: String, default: "" },
    regione: { type: String, default: "" }, 
    filosofia: { type: String, default: "" },
    sito: { type: String, default: "" }, 
    storia: { type: String, default: "" },
    unlockedContacts: [String] // ID dei sommelier sbloccati dalle cantine (Pay-per-match 15€)
}));

const Message = mongoose.model('Message', new mongoose.Schema({
    from: String, to: String, fromName: String, text: String, fileUrl: String, time: { type: Date, default: Date.now }
}));

const Media = mongoose.model('Media', new mongoose.Schema({
    ownerId: String, url: String, name: String, type: String, date: { type: Date, default: Date.now }
}));

// --- MIDDLEWARE & CONFIGURAZIONE UPLOAD ---
app.use(cors()); 
app.use(express.json()); 
app.use(express.static('public'));
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
                tipo: 'Sommelier', // Ruolo di default per registrazione tramite Google
                piano: 'Freemium'
            });
            await user.save();
        }
        res.json({ success: true, user });
    } catch (e) {
        res.status(500).json({ success: false, error: "Errore autenticazione Google" });
    }
});

// --- 2. API PAGAMENTI REALI (STRIPE) ---
app.post('/api/create-checkout', async (req, res) => {
    try {
        const { piano, prezzo, type, targetId, userId } = req.body;
        const session = await stripe.checkout