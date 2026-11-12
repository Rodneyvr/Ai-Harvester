'use client';

import { useState, useEffect } from 'react';
import { Search, Play, List, RefreshCw, Clock, FileText, AlertCircle, CheckCircle, ExternalLink, Plus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export function HarvesterView() {
  const [crawlUrl, setCrawlUrl] = useState('');
  const [queue, setQueue] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStats();
    loadQueue();
    loadLogs();
  }, []);

  const loadStats = async () => {
    try {
      const { data } = await api.harvesterApi.getQueueStats();
      setStats(data);
    } catch (e) { console.error(e); }
  };

  const loadQueue = async () => {
    try {
      const { data } = await api.harvesterApi.getQueue(undefined, 50);
      setQueue(data);
    } catch (e) { console.error(e); }
  };

  const loadLogs = async () => {
    try {
      const { data } = await api.harvesterApi.getLogs({ limit: 20 });
      setLogs(data);
    } catch (e) { console.error(e); }
  };

  const handleQueueCrawl = async () => {
    if (!crawlUrl.trim()) return;
    setLoading(true);
    try {
      await api.harvesterApi.queueCrawl(crawlUrl);
      setCrawlUrl('');
      loadQueue();
      loadStats();
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Failed to queue crawl');
    } finally { setLoading(false); }
  };

  const handleAutoDiscover = async () => {
    setLoading(true);
    try {
      await api.harvesterApi.autoDiscover(20);
      loadQueue();
      loadStats();
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Auto-discovery failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Universal Harvester</h1>
          <p className="text-muted-foreground mt-1">Discover AI agents across the web</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Queue Crawl</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="https://github.com/org/repo"
              value={crawlUrl}
              onChange={(e) => setCrawlUrl(e.target.value)}
              className="mb-2"
            />
            <Button
              onClick={handleQueueCrawl}
              disabled={loading || !crawlUrl.trim()}
              className="w-full"
            >
              {loading ? 'Queuing...' : 'Add to Queue'}
            </Button>
            <Button
              variant="outline"
              onClick={handleAutoDiscover}
              disabled={loading}
              className="w-full mt-2"
            >
              <Search className="h-4 w-4 mr-2" />
              Auto-Discover All
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Queue Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pending</span>
                    <span className="font-mono text-primary">{stats.pending}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Running</span>
                    <span className="font-mono text-warning">{stats.running}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Done</span>
                    <span className="font-mono text-green-600">{stats.done}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Failed</span>
                    <span className="font-mono text-destructive">{stats.failed}</span>
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground text-sm italic">Loading...</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Queue Sizes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats?.queue_sizes ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Crawl</span>
                    <span className="font-mono">{stats.queue_sizes.crawl}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Extract</span>
                    <span className="font-mono">{stats.queue_sizes.extract}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Normalize</span>
                    <span className="font-mono">{stats.queue_sizes.normalize}</span>
                  </div>
                </>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Crawl Queue</CardTitle>
            <Button variant="outline" size="sm" onClick={loadQueue}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {queue.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No items in queue</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="pb-3">URL</th>
                      <th className="pb-3">Source</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3">Attempts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.map((item) => (
                      <tr key={item.queue_id} className="border-b border-border/50">
                        <td className="py-3 truncate max-w-xs" title={item.url}>
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            {item.url}
                          </a>
                        </td>
                        <td className="py-3 text-muted-foreground">{item.source_type || 'manual'}</td>
                        <td className="py-3">
                          <Badge
                            variant={item.status === 'done' ? 'default' : item.status === 'failed' ? 'destructive' : 'secondary'}
                          >
                            {item.status}
                          </Badge>
                        </td>
                        <td className="py-3 font-mono">{item.attempts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Scrape Logs</CardTitle>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No scrape logs yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div key={log.id} className="p-3 rounded-lg border border-border/50 bg-muted/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground truncate max-w-xs" title={log.url}>
                        {log.url}
                      </span>
                      <Badge
                        variant={log.status === 'success' ? 'default' : log.status === 'failed' ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {log.status}
                      </Badge>
                    </div>
                    {log.error && (
                      <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2 rounded">
                        <AlertCircle className="h-4 w-4" />
                        <span className="truncate">{log.error}</span>
                      </div>
                    )}
                    {log.latency_ms && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <Clock className="h-3 w-3" />
                        <span>{log.latency_ms}ms</span>
                        {log.tokens_used && <span className="mx-2">•</span>}
                        {log.tokens_used && <span>{log.tokens_used} tokens</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}