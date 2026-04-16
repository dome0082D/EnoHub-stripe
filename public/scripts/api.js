/* ============================================================
   ENOHUB PROJECT - API CLIENT (CORRETTO PER RENDER)
   ============================================================ */

const EnoHubApi = (() => {
  // Usando '/api' il browser capisce di contattare lo stesso sito su cui si trova
  const API_URL = '/api';
  const USERS_PATH = '/utenti';
  const CHATS_PATH = '/chat';
  const EVENTS_PATH = '/eventi';
  const REGISTER_PATH = '/register';
  const LOGIN_PATH = '/login';

  const fetchApi = async (path, method = 'GET', data = null, isFile = false) => {
    const headers = {};
    const token = localStorage.getItem('enoUserToken');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const config = { method, headers };

    if (data) {
      if (isFile) {
        config.body = data;
      } else {
        headers['Content-Type'] = 'application/json';
        config.body = JSON.stringify(data);
      }
    }

    try {
      const response = await fetch(API_URL + path, config);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || response.statusText);
      return result;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  };

  return {
    register: async (formData) => fetchApi(REGISTER_PATH, 'POST', formData, true),
   
    login: async (email, password) => {
      const result = await fetchApi(LOGIN_PATH, 'POST', { email, password });
      if (result.success) {
        localStorage.setItem('enoUser', JSON.stringify(result.user));
        localStorage.setItem('enoUserToken', result.token);
        return { success: true, userType: result.user.tipo };
      }
      return { success: false, error: result.error };
    },
   
    logout: () => {
      localStorage.removeItem('enoUser');
      localStorage.removeItem('enoUserToken');
      window.location.href = '/auth/login.html';
    },

    isLoggedIn: () => !!localStorage.getItem('enoUserToken'),
    getUserName: () => {
        const user = localStorage.getItem('enoUser');
        return user ? JSON.parse(user).nome + ' ' + JSON.parse(user).cognome : '';
    },
    getUserType: () => {
        const user = localStorage.getItem('enoUser');
        return user ? JSON.parse(user).tipo : null;
    },
    getSommelierList: () => fetchApi(`${USERS_PATH}?tipo=sommelier`),
    getCantineList: () => fetchApi(`${USERS_PATH}?tipo=cantina`),
    getCantinaProfile: (id) => fetchApi(`${USERS_PATH}/${id}`),
    getEventsList: () => fetchApi(EVENTS_PATH),
    createEvent: (eventData) => fetchApi(`${EVENTS_PATH}/create`, 'POST', eventData)
  };
})();
