<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>EnoHub Staff - Login</title>
    <link rel="stylesheet" href="../style.css">
    <style>
        .login-box { 
            max-width: 400px; margin: 100px auto; 
            background: rgba(255, 255, 255, 0.95); 
            padding: 40px; border-radius: 15px; text-align: center;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
        }
        input { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; }
        .btn-staff { background: #8a1c1c; color: white; border: none; padding: 12px; width: 100%; border-radius: 5px; cursor: pointer; font-weight: bold; }
    </style>
</head>
<body class="bg-bottiglie"> <div class="login-box">
        <h2 style="color: #8a1c1c;">Staff Login</h2>
        <p style="color: #666;">Area riservata ai collaboratori EnoHub</p>
        <input type="email" id="email" placeholder="Email Staff">
        <input type="password" id="pass" placeholder="Password">
        <button class="btn-staff" onclick="loginStaff()">Accedi al Pannello</button>
        <div id="error" style="color: red; margin-top: 10px; display: none;">Accesso Negato</div>
    </div>

    <script>
        async function loginStaff() {
            const email = document.getElementById('email').value;
            const password = document.getElementById('pass').value;

            const res = await fetch('/api/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();

            // Controllo se è l'admin principale o un utente staff
            if (data.success && (data.user.email === 'dome0082@gmail.com' || data.user.tipo === 'Staff')) {
                localStorage.setItem('staffUser', JSON.stringify(data.user));
                window.location.href = 'index.html'; // Vai al pannello
            } else {
                document.getElementById('error').style.display = 'block';
                document.getElementById('error').innerText = "Credenziali errate o non sei autorizzato.";
            }
        }
    </script>
</body>
</html>
