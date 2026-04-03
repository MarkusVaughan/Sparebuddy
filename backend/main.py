from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import create_tables, seed_default_categories, SessionLocal
from .routers import transactions, accounts, categories, budgets, assets

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


@app.on_event("startup")
def on_startup():
    create_tables()
    db = SessionLocal()
    seed_default_categories(db)
    db.close()


@app.get("/health")
def health():
    return {"status": "ok", "app": "Sparebuddy"}
