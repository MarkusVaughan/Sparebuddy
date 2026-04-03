from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import transactions, accounts, categories, budgets, assets, goals

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


@app.get("/health")
def health():
    return {"status": "ok", "app": "Sparebuddy"}
