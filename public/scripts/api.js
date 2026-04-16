const EnoHubApi = (() => {
  const API_URL = '/api';

  return {
    // --- GESTIONE PAGAMENTI STRIPE E BONIFICO ---
    payWithStripe: async (piano, prezzo, userId) => {
      const response = await fetch(`${API_URL}/create-checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Aggiunto userId per far sapere al server chi sta pagando e attivargli la spunta
          body: JSON.stringify({ piano, prezzo, type: 'upgrade', userId })
      });
      const result = await response.json();
      if (result.url) window.location.href = result.url;
    },

    payWithBank: (piano, prezzo, userName = "Utente") => {
      alert(`PAGAMENTO CON BONIFICO\n\nImporto: €${prezzo}.00\nIBAN: IT 00 X 00000 00000 000000000000\nIntestato a: EnoHub\nCausale: Attivazione ${piano} - ${userName}\n\nInvia la ricevuta a info@enohub.it per l'attivazione manuale.`);
    },

    // --- ATTIVAZIONE AUTOMATICA (SPUNTA VERDE) ---
    activatePlan: async (userId, piano) => {
      const response = await fetch(`${API_URL}/activate-plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, piano })
      });
      return await response.json();
    },

    // --- ARCHIVIO DEGUSTAZIONI (CON LIMITI) ---
    getTastings: async (userId) => {
      const response = await fetch(`${API_URL}/user/${userId}/degustazioni`);
      return await response.json();
    },

    addTasting: async (userId, tastingData) => {
      // Uso la rotta PUT del profilo per sfruttare i limiti imposti dal server
      const response = await fetch(`${API_URL}/user/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ degustazioni: tastingData })
      });
      return await response.json();
    },

    // --- LOGIN E UTILITY ---
    login: async (email, password) => {
      const response = await fetch(`${API_URL}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
      });
      const result = await response.json();
      if(result.success) {
          localStorage.setItem('enohub_user', JSON.stringify(result.user));
      }
      return result;
    }
  };
})();
