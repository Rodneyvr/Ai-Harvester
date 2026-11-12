'use client';

import { useState, useEffect } from 'react';
import { Search, Filter, List, LayoutGrid, Code, Brain, Copy, Download, MoreHorizontal, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export function LibraryView() {
  const [agents, setAgents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [minQuality, setMinQuality] = useState(0);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    loadMetadata();
    loadAgents();
  }, []);

  const loadMetadata = async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        api.agentsApi.platforms(),
        api.agentsApi.categories(),
      ]);
      setPlatforms(pRes.data || []);
      setCategories(cRes.data || []);
    } catch (e) { console.error(e); }
  };

  const loadAgents = async () => {
    setLoading(true);
    try {
      const { data } = await api.agentsApi.list({
        query: query || undefined,
        platform: platform || undefined,
        category: category || undefined,
        tags: tags.length ? tags : undefined,
        min_quality: minQuality || undefined,
      });
      setAgents(data.agents);
      setTotal(data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agent Library</h1>
          <p className="text-muted-foreground mt-1">Browse harvested AI agents and skills</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setViewMode('grid')} variant={viewMode === 'grid' ? 'default' : 'outline'} size="icon" aria-label="Grid view">
            <LayoutGrid className="h-5 w-5" />
          </Button>
          <Button onClick={() => setViewMode('list')} variant={viewMode === 'list' ? 'default' : 'outline'} size="icon" aria-label="List view">
            <List className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search agents..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="relative">
              <Input
                placeholder="Platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="relative">
              <Input
                placeholder="Category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="pl-10"
              />
            </div>
            <div>
              <Button onClick={loadAgents} className="w-full">
                Apply Filters
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className={viewMode === 'grid' ? 'grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'space-y-2'}>
        {loading ? (
          <div className="col-span-full flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : agents.length === 0 ? (
          <div className="col-span-full text-center py-20 text-muted-foreground">
            <Brain className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p>No agents found</p>
            <Button variant="outline" onClick={() => (window.location.href = '/harvester')}>
              Run Auto-Discovery
            </Button>
          </div>
        ) : (
          viewMode === 'grid' ? (
            agents.map((agent) => (
              <Card key={agent.id} className="group cursor-pointer hover:border-primary/50 transition-colors" onClick={() => (window.location.href = `/library/${agent.id}`)}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium truncate">{agent.name}</h3>
                      <p className="text-sm text-muted-foreground truncate">{agent.description || 'No description'}</p>
                    </div>
                    <Badge variant={agent.is_verified ? 'default' : 'outline'} className="text-xs">
                      {agent.quality_score}%
                    </Badge>
                  </div>
                  <div className="flex gap-1 mt-2">
                    {(agent.tags || []).slice(0, 3).map((tag: string) => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  <div className="flex justify-between mb-1">
                    <span>{agent.platform}</span>
                    <span>{formatDate(agent.created_at)}</span>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground border-b border-border">
                <tr>
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Platform</th>
                  <th className="pb-3 font-medium">Quality</th>
                  <th className="pb-3 font-medium">Tags</th>
                  <th className="pb-3 font-medium">Verified</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                    <td className="py-3">
                      <div className="font-medium truncate">{agent.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{agent.source_url}</div>
                    </td>
                    <td className="py-3">{agent.platform}</td>
                    <td className="py-3">
                      <Badge variant={agent.is_verified ? 'default' : 'outline'}>{agent.quality_score}%</Badge>
                    </td>
                    <td className="py-3">
                      {(agent.tags || []).slice(0, 2).join(', ')}
                    </td>
                    <td className="py-3">
                      {agent.is_verified ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Clock className="h-4 w-4 text-muted-foreground" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}