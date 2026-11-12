'use client';

import { useState } from 'react';
import { Terminal, Play, StopCircle, Copy, Key, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

export function SandboxView() {
  const [code, setCode] = useState('# AI Agent Code\nprint("Hello from sandbox!")\n');
  const [requiredKeys, setRequiredKeys] = useState('');
  const [language, setLanguage] = useState('python');
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const defaultCode = `# AI Agent - Example
import os

# Get API keys from environment
openai_key = os.getenv("OPENAI_API_KEY", "not set")
serper_key = os.getenv("SERPER_API_KEY", "not set")

print(f"OpenAI key configured: {bool(openai_key and openai_key != 'not set')}")
print(f"Serper key configured: {bool(serper_key and serper_key != 'not set')}")

# Your agent logic here
result = {"status": "success", "message": "Sandbox execution complete"}
print(result)
`;

  const handleExecute = async () => {
    setIsRunning(true);
    setOutput([]);
    setResult(null);
    try {
      const data = await api.sandboxApi.execute({
        agent_code: code,
        required_keys: requiredKeys.split(',').map(k => k.trim()).filter(Boolean),
        language,
        timeout: 30,
      });
      setResult(data);
      data.stdout.split('\n').forEach((line: string) => {
        if (line.trim()) setOutput(prev => [...prev, { type: 'stdout', data: line }]);
      });
      data.stderr.split('\n').forEach((line: string) => {
        if (line.trim()) setOutput(prev => [...prev, { type: 'stderr', data: line }]);
      });
    } catch (e: any) {
      setOutput(prev => [...prev, { type: 'stderr', data: e.response?.data?.detail || 'Execution failed' }]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleKillAll = async () => {
    try {
      await api.sandboxApi.killAll();
      alert('All processes killed');
    } catch (e) { alert('Failed to kill processes'); }
  };

  const handleHealthCheck = async () => {
    try {
      const keys = requiredKeys.split(',').map(k => k.trim()).filter(Boolean);
      const results = await api.sandboxApi.healthCheck(keys);
      results.forEach((r: any) => {
        setOutput(prev => [...prev, {
          type: r.is_valid ? 'stdout' : 'stderr',
          data: `${r.provider}: ${r.is_valid ? 'VALID' : 'INVALID'} (${r.latency_ms}ms)`
        }]);
      });
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Health check failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agent Sandbox</h1>
          <p className="text-muted-foreground mt-1">Test harvested agents with your vault credentials</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Code Editor</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex flex-col h-[500px]">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted">
                <div className="flex gap-2">
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded-full bg-red-500" />
                    <div className="h-3 w-3 rounded-full bg-yellow-500" />
                    <div className="h-3 w-3 rounded-full bg-green-500" />
                  </div>
                  <span className="text-xs text-muted-foreground">{language}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => {
                    setCode(defaultCode);
                    navigator.clipboard.writeText(code);
                  }}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExecute} disabled={isRunning}>
                    {isRunning ? <StopCircle className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="flex-1 w-full font-mono text-sm p-4 bg-background text-foreground focus:outline-none resize-none"
                spellCheck={false}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Language</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full border-input bg-background border rounded-md px-3 py-2 text-sm">
                <option value="python">Python</option>
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Required API Keys</label>
              <p className="text-xs text-muted-foreground">Comma-separated key names (e.g., OPENAI_API_KEY, SERPER_API_KEY)</p>
              <Input value={requiredKeys} onChange={(e) => setRequiredKeys(e.target.value)} placeholder="OPENAI_API_KEY, SERPER_API_KEY" />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleExecute} disabled={isRunning} className="flex-1">
                {isRunning ? 'Running...' : <><Play className="h-4 w-4 mr-2" />Execute</>}
              </Button>
              <Button variant="outline" onClick={handleHealthCheck}>
                <Key className="h-4 w-4 mr-2" />
                Check Keys
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Execution Output</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {result ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">Result</span>
                  <Badge variant={result.success ? 'default' : 'destructive'} className="text-xs">
                    {result.success ? 'Success' : 'Failed'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Clock className="h-3 w-3" />
                  <span>{result.execution_time_ms}ms</span>
                  <span className="mx-1">•</span>
                  <span>Exit code: {result.exit_code}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No execution yet</p>
            )}
            <div className="h-[200px] overflow-y-auto bg-muted/50 rounded p-2 font-mono text-xs space-y-1">
              {output.length === 0 ? (
                <p className="text-muted-foreground italic">Output will appear here</p>
              ) : (
                output.map((item, i) => (
                  <div key={i} className={`flex items-start gap-1 ${item.type === 'stderr' ? 'text-destructive' : 'text-foreground'}`}>
                    <span className="text-muted-foreground">{item.type === 'stderr' ? '>' : '$'}</span>
                    <span className="break-all">{item.data}</span>
                  </div>
                ))
              )}
            </div>
            {result && result.exit_code !== 0 && (
              <Button variant="outline" size="sm" onClick={handleKillAll} className="mt-2">
                <StopCircle className="h-3 w-3 mr-1" />
                Kill All Processes
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}