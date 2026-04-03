# Sparebuddy 💰

Personlig budsjett- og formuesapp. Lokalt kjørende webapplikasjon.

## Kom i gang

### Krav
- Python 3.11+
- Node.js 18+

---

### 1. Backend

```bash
cd backend

# Opprett virtuelt miljø (anbefalt)
python3 -m venv venv
source venv/bin/activate        # Mac/Linux
# venv\Scripts\activate         # Windows

# Installer avhengigheter
pip install -r requirements.txt

# Start serveren
uvicorn backend.main:app --reload
```

Backend kjører på: **http://localhost:8001**
API-dokumentasjon: **http://localhost:8001/docs**

---

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Åpne i nettleseren: **http://localhost:5173**

---

## VS Code

Åpne `sparebuddy.code-workspace` direkte i VS Code for å få:
- Anbefalt utvidelsesliste (Python, Pylance, Tailwind, ESLint, Prettier)
- Debug-konfigurasjon for backend
- Riktige innstillinger per prosjektdel

---

## Importere fra DNB

1. Logg inn på [DNB nettbank](https://dnb.no)
2. Gå til kontooversikten → velg konto → Eksporter transaksjoner → CSV
3. Gå til **Transaksjoner** i Sparebuddy
4. Velg riktig konto og last opp filen

---

## Prosjektstruktur

```
sparebuddy/
├── backend/
│   ├── main.py              # FastAPI app
│   ├── database.py          # SQLite modeller
│   ├── requirements.txt
│   ├── routers/
│   │   ├── transactions.py
│   │   ├── accounts.py
│   │   ├── categories.py
│   │   ├── budgets.py
│   │   └── assets.py
│   └── services/
│       ├── dnb_importer.py  # Parser DNB CSV
│       └── categorizer.py   # Auto-kategorisering
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/           # Dashboard, Transaksjoner, Budsjett, Formue, Kategorier
│   │   └── utils/           # API-klient, formattering
│   ├── package.json
│   └── vite.config.js
└── sparebuddy.code-workspace
```

---

## Veikart

- [x] Backend med SQLite (Phase 1)
- [x] DNB CSV-importering
- [x] Auto-kategorisering med regler
- [x] Budsjett vs faktisk forbruk
- [x] Formuesoversikt
- [ ] Flerbruker / familieinnlogging (Phase 2)
- [ ] Automatisk banktilkobling via PSD2 (Phase 3)
