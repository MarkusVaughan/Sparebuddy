from urllib.parse import quote

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from .routers import auth, transactions, accounts, categories, budgets, assets, goals, notifications, users

app = FastAPI(title="Sparebuddy API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(transactions.router)
app.include_router(accounts.router)
app.include_router(categories.router)
app.include_router(budgets.router)
app.include_router(assets.router)
app.include_router(goals.router)
app.include_router(notifications.router)
app.include_router(users.router)
app.include_router(auth.router)


@app.get("/health")
def health():
    return {"status": "ok", "app": "Sparebuddy"}


@app.get("/vipps-redirect", response_class=HTMLResponse, include_in_schema=False)
def vipps_redirect(
    phone: str = Query(default=None),
    amount: int = Query(default=None),
    message: str = Query(default=""),
):
    if not phone or amount is None:
        return HTMLResponse("<p>Mangler phone eller amount</p>", status_code=400)
    vipps_url = f"vipps://payment?phoneNumber={phone}&amount={amount}&message={quote(f'Sparebuddy: {message}')}"
    html = f"""<!DOCTYPE html>
<html lang="no">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0;url={vipps_url}">
  <title>Åpner Vipps...</title>
  <style>body{{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fff}}</style>
</head>
<body>
  <div style="text-align:center">
    <p>Åpner Vipps...</p>
    <a href="{vipps_url}">Trykk her hvis Vipps ikke åpner automatisk</a>
  </div>
  <script>window.location.href="{vipps_url}"</script>
</body>
</html>"""
    return HTMLResponse(html)
