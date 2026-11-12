from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .core.config import get_settings
from .core.database import init_db, close_db
from .core.queue import get_queue_service
from .api import vault, agents, harvester, sandbox


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    settings = get_settings()

    # Initialize database
    await init_db()

    # Initialize queue
    queue = get_queue_service()

    yield

    # Cleanup
    await queue.close()
    await close_db()


settings = get_settings()

app = FastAPI(
    title="AI Harvester Vault API",
    description="Universal AI Skill & Agent Harvester with Secure Credential Vault",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", settings.next_public_api_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": str(exc)},
    )


# Health check
@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "0.1.0"}


# Include routers
app.include_router(vault.router)
app.include_router(agents.router)
app.include_router(harvester.router)
app.include_router(sandbox.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.environment == "development",
    )