const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  photo: String,
  title: String, // es: "Head Sommelier & Wine Director"
  location: String,
  isAvailable: { type: Boolean, default: false },
  bio: String,
  specializations: [String], // Array per i tag (Borgogna, Barolo...)
  certifications: [String],
  // Riferimento alle cantine (se hai una collezione separata 'Winery')
  wineries: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Winery' }]
});

module.exports = mongoose.model('User', UserSchema);
