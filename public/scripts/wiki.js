async function searchWine() {
    const wine = document.getElementById('wineInput').value;
    const resultDiv = document.getElementById('wikiResult');
    
    if(!wine) return alert("Scrivi il nome di un vino!");

    resultDiv.innerHTML = "<p>Interrogazione database mondiale in corso...</p>";

    try {
        const response = await fetch(`/api/wine-wiki/${encodeURIComponent(wine)}`);
        const data = await response.json();

        if(data.error) {
            resultDiv.innerHTML = `<p style="color:red;">${data.error}</p>`;
        } else {
            resultDiv.innerHTML = `
                <div class="wiki-card">
                    ${data.immagine ? `<img src="${data.immagine}" alt="${data.nome}">` : ''}
                    <div class="wiki-info">
                        <h2>${data.nome}</h2>
                        <p>${data.descrizione}</p>
                        <a href="https://it.wikipedia.org/wiki/${data.nome}" target="_blank" class="wiki-link">Leggi di più su Wikipedia →</a>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        resultDiv.innerHTML = "<p>Errore di connessione al database Wikipedia.</p>";
    }
}
