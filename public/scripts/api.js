const EnoHubApi = (() => {
  const API_URL = '/api';

  return {
    // --- GESTIONE PAGAMENTI ---
    payWithStripe: async (piano, prezzo) => {
      const response = await fetch(`${API_URL}/create-checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ piano, prezzo, type: 'upgrade' })
      });
      const result = await response.json();
      if (result.url) window.location.href = result.url;
    },

    payWithBank: (piano, prezzo) => {
      alert(`BONIFICO: €${prezzo}\nIBAN: IT 00 X 00000 00000 000000000000\nCausale: ${piano}`);
    },

    // --- ARCHIVIO DEGUSTAZIONI (ORA ATTIVO) ---
    getTastings: async (userId) => {
      const response = await fetch(`${API_URL}/user/${userId}/degustazioni`);
      return await response.json();
    },

    addTasting: async (userId, tastingData) => {
      const response = await fetch(`${API_URL}/user/${userId}/degustazioni`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tastingData)
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
      if(result.success) localStorage.setItem('enoUser', JSON.stringify(result.user));
      return result;
    }
  };
})();