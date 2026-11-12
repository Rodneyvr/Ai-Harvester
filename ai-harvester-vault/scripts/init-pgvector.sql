-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create custom types
CREATE TYPE agent_platform AS ENUM ('github', 'huggingface', 'mcp', 'web', 'gitlab', 'bitbucket', 'npm', 'pypi', 'other');
CREATE TYPE crawl_status AS ENUM ('pending', 'running', 'done', 'failed');
CREATE TYPE credential_environment AS ENUM ('production', 'development', 'free-tier');

-- Core tables
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    source_url TEXT UNIQUE NOT NULL,
    platform agent_platform NOT NULL DEFAULT 'other',
    category TEXT,
    tags TEXT[],
    system_prompt TEXT,
    tool_code TEXT,
    dependencies JSONB DEFAULT '{}',
    required_keys TEXT[],
    quality_score SMALLINT CHECK (quality_score BETWEEN 0 AND 100),
    content_hash CHAR(64),
    embedding VECTOR(768),
    version INT DEFAULT 1,
    is_verified BOOLEAN DEFAULT FALSE,
    scanned_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    code TEXT,
    language TEXT,
    entry_point TEXT,
    config_schema JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE api_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    category TEXT,
    tags TEXT[],
    environment credential_environment DEFAULT 'development',
    encrypted_value BYTEA NOT NULL,
    nonce BYTEA NOT NULL,
    tag BYTEA NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ,
    is_valid BOOLEAN
);

CREATE TABLE crawl_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    source_type TEXT,
    priority INT DEFAULT 0,
    status crawl_status DEFAULT 'pending',
    attempts INT DEFAULT 0,
    error TEXT,
    discovered_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE TABLE scrape_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id UUID REFERENCES crawl_queue(id) ON DELETE SET NULL,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    url TEXT,
    status TEXT,
    extracted_data JSONB,
    error TEXT,
    latency_ms INT,
    tokens_used INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_agents_platform ON agents(platform);
CREATE INDEX idx_agents_category ON agents(category);
CREATE INDEX idx_agents_tags ON agents USING GIN(tags);
CREATE INDEX idx_agents_content_hash ON agents(content_hash);
CREATE INDEX idx_agents_embedding ON agents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_skills_agent_id ON skills(agent_id);
CREATE INDEX idx_credentials_category ON api_credentials(category);
CREATE INDEX idx_credentials_environment ON api_credentials(environment);
CREATE INDEX idx_credentials_provider ON api_credentials(provider);
CREATE INDEX idx_queue_status_priority ON crawl_queue(status, priority DESC);
CREATE INDEX idx_scrape_logs_queue_id ON scrape_logs(queue_id);
CREATE INDEX idx_scrape_logs_agent_id ON scrape_logs(agent_id);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_skills_updated_at BEFORE UPDATE ON skills FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_credentials_updated_at BEFORE UPDATE ON api_credentials FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();