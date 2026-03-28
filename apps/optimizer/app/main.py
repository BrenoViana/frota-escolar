from fastapi import FastAPI

app = FastAPI(title="Optimizer")

@app.get("/health")
def health():
    return {"ok": True, "service": "optimizer"}
