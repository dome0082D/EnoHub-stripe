/* ============================================================
   ENOHUB PROJECT - UI RENDERING ENGINE
   ============================================================ */
const EnoHubUI = {
    // Legge parametri dall'URL (es. ?id=123)
    getQueryParam: (param) => {
        return new URLSearchParams(window.location.search).get(param);
    },

    // Disegna la lista Sommelier (Immagine 7)
    initSommelierList: async () => {
        const sommelier = await EnoHubApi.getSommelierList();
        const grid = document.getElementById('sommelierGrid');
        grid.innerHTML = sommelier.map(s => `
            <div class="sommelier-card">
                <div class="sommelier-card__img"><img src="../../${s.foto || 'uploads/profiles/default.png'}"></div>
                <div class="sommelier-card__body">
                    <h3>${s.nome}</h3>
                    <p>${s.qualifica}</p>
                    <p class="text-muted">${s.citta}</p>
                    <a href="sommelier-profile.html?id=${s.id}" class="btn-vedi-profilo">Vedi Profilo</a>
                </div>
            </div>
        `).join('');
    },

    // Disegna il profilo Sommelier (Immagine 1)
    renderSommelierProfile: (s) => {
        document.getElementById('p-nome').innerText = s.nome;
        document.getElementById('p-foto').src = "../../" + (s.foto || 'uploads/profiles/default.png');
        document.getElementById('p-bio').innerText = s.bio || "Nessuna biografia.";
        document.getElementById('p-location').innerText = s.citta;
        document.getElementById('p-title').innerText = s.qualifica;
        
        if(EnoHubApi.isLoggedIn()) {
            document.getElementById('contattiBox').style.display = 'block';
            document.getElementById('p-email').innerText = s.email;
            if(s.cv) document.getElementById('p-cv').innerHTML = `<a href="../../${s.cv}" class="btn-download" download>📄 Scarica CV</a>`;
        }
    }
};