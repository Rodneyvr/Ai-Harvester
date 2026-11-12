from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from jinja2 import Environment, FileSystemLoader, select_autoescape

from ..models import Agent, Skill
from ..services.vault import VaultService
from ..core.database import get_session


@dataclass(slots=True)
class ExportResult:
    content: str
    filename: str
    mime_type: str


class ExporterService:
    """Export agents/skills as runnable code in various formats."""

    def __init__(self, session=None):
        self.session = session
        self.vault = VaultService(session) if session else None

        # Setup Jinja2 environment
        import os
        template_dir = os.path.join(os.path.dirname(__file__), "templates")
        os.makedirs(template_dir, exist_ok=True)
        self.jinja_env = Environment(
            loader=FileSystemLoader(template_dir),
            autoescape=select_autoescape(),
            trim_blocks=True,
            lstrip_blocks=True,
        )
        self._create_default_templates()

    def _create_default_templates(self):
        """Create default export templates if they don't exist."""
        templates = {
            "python_agent.py.j2": PYTHON_AGENT_TEMPLATE,
            "typescript_agent.ts.j2": TYPESCRIPT_AGENT_TEMPLATE,
            "dockerfile.j2": DOCKERFILE_TEMPLATE,
            "mcp_server.json.j2": MCP_SERVER_TEMPLATE,
            "pyproject.toml.j2": PYPROJECT_TEMPLATE,
            "requirements.txt.j2": REQUIREMENTS_TEMPLATE,
        }
        import os
        template_dir = os.path.join(os.path.dirname(__file__), "templates")
        for filename, content in templates.items():
            path = os.path.join(template_dir, filename)
            if not os.path.exists(path):
                with open(path, "w") as f:
                    f.write(content)

    async def export_agent(
        self,
        agent: Agent,
        format: str,
        include_credentials: bool = False,
    ) -> ExportResult:
        """Export a single agent in specified format."""
        skills = []
        if self.session:
            from sqlalchemy import select
            from ..models import Skill
            result = await self.session.execute(
                select(Skill).where(Skill.agent_id == agent.id)
            )
            skills = result.scalars().all()

        # Prepare credentials if requested
        credentials = {}
        if include_credentials and self.vault and agent.required_keys:
            for key_name in agent.required_keys:
                creds, _ = await self.vault.list(search=key_name, page_size=5)
                for cred in creds:
                    if cred.name.lower() == key_name.lower() or cred.provider.lower() in key_name.lower():
                        reveal = await self.vault.reveal(cred.id)
                        if reveal:
                            credentials[key_name] = reveal.value
                            break

        context = {
            "agent": agent,
            "skills": skills,
            "credentials": credentials,
            "has_credentials": bool(credentials),
        }

        if format == "python":
            template = self.jinja_env.get_template("python_agent.py.j2")
            content = template.render(**context)
            return ExportResult(content, f"{agent.name.lower().replace(' ', '_')}_agent.py", "text/x-python")

        elif format == "typescript":
            template = self.jinja_env.get_template("typescript_agent.ts.j2")
            content = template.render(**context)
            return ExportResult(content, f"{agent.name.lower().replace(' ', '_')}_agent.ts", "text/typescript")

        elif format == "docker":
            template = self.jinja_env.get_template("dockerfile.j2")
            content = template.render(**context)
            return ExportResult(content, "Dockerfile", "text/plain")

        elif format == "mcp":
            template = self.jinja_env.get_template("mcp_server.json.j2")
            content = template.render(**context)
            return ExportResult(content, "mcp.json", "application/json")

        elif format == "env":
            lines = ["# Exported credentials for agent: " + agent.name, ""]
            for key, value in credentials.items():
                lines.append(f"{key}={value}")
            return ExportResult("\n".join(lines), ".env", "text/plain")

        else:
            raise ValueError(f"Unknown export format: {format}")

    async def export_combined(
        self,
        agents: list[Agent],
        format: str,
    ) -> ExportResult:
        """Export multiple agents as a combined package."""
        if format == "python":
            # Combine into a single Python package
            template = self.jinja_env.get_template("python_agent.py.j2")
            # Would need a multi-agent template
            pass

        # For now, export first agent
        if agents:
            return await self.export_agent(agents[0], format)

        raise ValueError("No agents to export")


# Default Templates
PYTHON_AGENT_TEMPLATE = '''# {{ agent.name }} - AI Agent
# Auto-generated from AI Harvester Vault
# Source: {{ agent.source_url }}

"""
{{ agent.description or "No description provided." }}
"""

import os
import json
from typing import Dict, Any, Optional

{% if agent.system_prompt %}
SYSTEM_PROMPT = """{{ agent.system_prompt }}"""
{% else %}
SYSTEM_PROMPT = "You are a helpful AI assistant."
{% endif %}

{% if agent.tool_code %}
# Tool Definitions
{{ agent.tool_code }}
{% endif %}

{% if agent.dependencies.python %}
# Dependencies: {{ agent.dependencies.python | join(", ") }}
{% endif %}

class {{ agent.name | replace(' ', '') | replace('-', '') }}Agent:
    def __init__(self):
        self.name = "{{ agent.name }}"
        self.system_prompt = SYSTEM_PROMPT
        self.required_keys = {{ agent.required_keys | tojson }}

    def get_config(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "system_prompt": self.system_prompt,
            "required_keys": self.required_keys,
        }

    def run(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Main execution logic - implement based on agent type."""
        # TODO: Implement agent execution logic
        return {"status": "not_implemented", "agent": self.name}

    async def run_async(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        return self.run(input_data)


if __name__ == "__main__":
    agent = {{ agent.name | replace(' ', '') | replace('-', '') }}Agent()
    print(f"Agent: {agent.name}")
    print(f"Required keys: {agent.required_keys}")
    config = agent.get_config()
    print(json.dumps(config, indent=2))
'''

TYPESCRIPT_AGENT_TEMPLATE = '''// {{ agent.name }} - AI Agent
// Auto-generated from AI Harvester Vault
// Source: {{ agent.source_url }}

/**
 * {{ agent.description or "No description provided." }}
 */

{% if agent.system_prompt %}
const SYSTEM_PROMPT = `{{ agent.system_prompt }}`;
{% else %}
const SYSTEM_PROMPT = "You are a helpful AI assistant.";
{% endif %}

{% if agent.tool_code %}
// Tool Definitions
{{ agent.tool_code }}
{% endif %}

export interface AgentConfig {
  name: string;
  systemPrompt: string;
  requiredKeys: string[];
}

export class {{ agent.name | replace(' ', '') | replace('-', '') }}Agent {
  public readonly name = "{{ agent.name }}";
  public readonly systemPrompt = SYSTEM_PROMPT;
  public readonly requiredKeys = {{ agent.required_keys | tojson }};

  getConfig(): AgentConfig {
    return {
      name: this.name,
      systemPrompt: this.systemPrompt,
      requiredKeys: this.requiredKeys,
    };
  }

  async run(input: Record<string, any>): Promise<Record<string, any>> {
    // TODO: Implement agent execution logic
    return { status: "not_implemented", agent: this.name };
  }
}

if (import.meta.main) {
  const agent = new {{ agent.name | replace(' ', '') | replace('-', '') }}Agent();
  console.log(`Agent: ${agent.name}`);
  console.log(`Required keys: ${agent.requiredKeys.join(", ")}`);
  console.log(JSON.stringify(agent.getConfig(), null, 2));
}
'''

DOCKERFILE_TEMPLATE = '''# {{ agent.name }} - Docker Image
# Auto-generated from AI Harvester Vault

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \\
    gcc \\
    libpq-dev \\
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy agent code
COPY {{ agent.name | lower | replace(' ', '_') }}_agent.py .

{% if agent.required_keys %}
# Required environment variables (set at runtime)
{% for key in agent.required_keys %}
ENV {{ key }}=""
{% endfor %}
{% endif %}

# Run agent
CMD ["python", "{{ agent.name | lower | replace(' ', '_') }}_agent.py"]
'''

MCP_SERVER_TEMPLATE = '''{
  "name": "{{ agent.name | lower | replace(' ', '-') }}",
  "version": "1.0.0",
  "description": "{{ agent.description or "MCP Server for " + agent.name }}",
  "author": "AI Harvester Vault",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "{{ agent.source_url }}"
  },
  "mcp": {
    "version": "0.1.0",
    "capabilities": {
      "tools": true,
      "resources": false,
      "prompts": false
    }
  },
  "server": {
    "command": "python",
    "args": ["{{ agent.name | lower | replace(' ', '_') }}_agent.py"],
    "env": {
      {% for key in agent.required_keys %}
      "{{ key }}": "{{ key }}",
      {% endfor %}
    }
  },
  "tools": [
    {% if agent.tool_code %}
    // Tools would be extracted from tool_code
    {% else %}
    {
      "name": "run_agent",
      "description": "Execute the {{ agent.name }} agent",
      "inputSchema": {
        "type": "object",
        "properties": {
          "input": {
            "type": "object",
            "description": "Input data for the agent"
          }
        },
        "required": ["input"]
      }
    }
    {% endif %}
  ]
}
'''

PYPROJECT_TEMPLATE = '''[project]
name = "{{ agent.name | lower | replace(' ', '-') }}-agent"
version = "1.0.0"
description = "{{ agent.description or "AI Agent from Harvester Vault" }}"
readme = "README.md"
requires-python = ">=3.11"
dependencies = [
    {% for dep in agent.dependencies.python or [] %}
    "{{ dep }}",
    {% endfor %}
]

[project.optional-dependencies]
dev = [
    "pytest>=7.4.0",
    "pytest-asyncio>=0.23.0",
    "ruff>=0.1.0",
    "mypy>=1.7.0",
]

[build-system]
requires = ["setuptools>=68.0"]
build-backend = "setuptools.build_meta"

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.mypy]
python_version = "3.11"
strict = true
'''

REQUIREMENTS_TEMPLATE = '''# {{ agent.name }} - Requirements
# Auto-generated from AI Harvester Vault

{% for dep in agent.dependencies.python or [] %}
{{ dep }}
{% endfor %}

{% if agent.required_keys %}
# Required API keys (set as environment variables):
{% for key in agent.required_keys %}
# {{ key }}
{% endfor %}
{% endif %}
'''