document.addEventListener('DOMContentLoaded', () => {
    loadEvents();
    checkCantinaRole();
});

async function loadEvents() {
    const events = await EnoHubApi.fetchApi('/eventi');
    const tbody = document.getElementById('eventsTableBody');
    
    if (events.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nessun evento registrato al momento. Torna a trovarci presto!</td></tr>';
        return;
    }

    tbody.innerHTML = events.map(e => `
        <tr>
            <td style="font-weight:bold; color:var(--dark);">${e.data}</td>
            <td><a href="../level1/cantine-profile.html?id=${e.creatoreId}" class="cantina-link">${e.nomeCantina}</a></td>
            <td>${e.titolo}</td>
            <td>${e.descrizione}</td>
            <td style="font-style:italic;">${e.luogo}</td>
        </tr>
    `).join('');
}

function checkCantinaRole() {
    const user = JSON.parse(localStorage.getItem('enoUser'));
    const token = localStorage.getItem('enoUserToken');
    
    // Se loggato come cantina, mostra il tasto per creare eventi
    if (user && token && user.tipo === 'cantina') {
        document.getElementById('btnCreateEvent').style.display = 'block';
    }
}

// Funzione di placeholder per creare eventi (implementeremo la pagina nel prossimo livello)
function showCreateForm() {
    alert("Questa funzionalità sarà completata nel livello 6 con la pagina 'Crea Evento' dedicata alle Cantine!");
}