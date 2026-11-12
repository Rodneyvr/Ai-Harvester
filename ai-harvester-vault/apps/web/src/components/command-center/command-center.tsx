'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Brain,
  Search,
  Database,
  Key,
  Terminal,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  HardDrive,
  Zap,
} from 'lucide-react';
import { api, Agent, Credential } from '@/lib/api';
import { cn, formatDate, formatBytes } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
  description?: string;
}

function StatCard({ title, value, icon, trend, trendUp, description }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
          <div className={cn('p-3 rounded-xl', 'bg-primary/10 text-primary')}>
            {icon}
          </div>
        </div>
        {trend && (
          <div className="mt-4 flex items-center gap-2">
            <span className={cn('text-sm font-medium', trendUp ? 'text-green-600' : 'text-red-600')}>
              {trendUp ? <TrendingUp className="h-4 w-4" /> : <TrendingUp className="h-4 w-4 rotate-180" />}
              {trend}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CommandCenter() {
  const { data: agentStats } = useQuery({
    queryKey: ['agent-stats'],
    queryFn: () => api.agentsApi.stats(),
    refetchInterval: 30000,
  });

  const { data: vaultStats } = useQuery({
    queryKey: ['vault-stats'],
    queryFn: async () => {
      const [creds, categories, providers] = await Promise.all([
        api.vaultApi.list({ page_size: 1 }),
        api.vaultApi.categories(),
        api.vaultApi.providers(),
      ]);
      return {
        totalCredentials: creds.total,
        categories: categories.length,
        providers: providers.length,
      };
    },
    refetchInterval: 30000,
  });

  const { data: harvesterStats } = useQuery({
    queryKey: ['harvester-stats'],
    queryFn: () => api.harvesterApi.getQueueStats(),
    refetchInterval: 10000,
  });

  const { data: recentAgents } = useQuery({
    queryKey: ['recent-agents'],
    queryFn: () => api.agentsApi.list({ page_size: 5, query: '' }),
  });

  const storageUsed = 127; // MB
  const storageTotal = 500;
  const storagePercent = (storageUsed / storageTotal) * 100;

  const quickActions = [
    { name: 'Auto-Discover Agents', href: '/harvester', icon: Search, description: 'Run internet-wide agent discovery' },
    { name: 'Browse Agent Library', href: '/library', icon: Database, description: 'Search and filter harvested agents' },
    { name: 'Manage API Keys', href: '/vault', icon: Key, description: 'Add, edit, and organize credentials' },
    { name: 'Test in Sandbox', href: '/sandbox', icon: Terminal, description: 'Execute agents with live keys' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Command Center</h1>
          <p className="text-muted-foreground mt-1">
            Monitor and control your AI agent harvesting operations
          </p>
        </div>
        <Button onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Total Agents"
          value={agentStats?.total_agents || 0}
          icon={<Brain className="h-8 w-8" />}
          trend={`+${agentStats?.verified_agents || 0} verified`}
          trendUp={true}
          description={`Avg quality: ${agentStats?.average_quality || 0}%`}
        />
        <StatCard
          title="API Credentials"
          value={vaultStats?.totalCredentials || 0}
          icon={<Key className="h-8 w-8" />}
          trend={`${vaultStats?.categories || 0} categories`}
          trendUp={true}
          description={`${vaultStats?.providers || 0} providers`}
        />
        <StatCard
          title="Pending Crawls"
          value={harvesterStats?.pending || 0}
          icon={<Search className="h-8 w-8" />}
          trend={`${harvesterStats?.running || 0} running`}
          description={`${harvesterStats?.done || 0} completed`}
        />
        <StatCard
          title="Queue Size"
          value={harvesterStats?.queue_sizes?.crawl || 0}
          icon={<Zap className="h-8 w-8" />}
          trend={`Extract: ${harvesterStats?.queue_sizes?.extract || 0}`}
          description={`Normalize: ${harvesterStats?.queue_sizes?.normalize || 0}`}
        />
        <StatCard
          title="DB Storage"
          value={`${storageUsed} / ${storageTotal} MB`}
          icon={<HardDrive className="h-8 w-8" />}
          trend={`${storagePercent.toFixed(1)}% used`}
          trendUp={storagePercent > 80}
          description="Auto-prunes at 90%"
        />
      </div>

      {/* Storage Progress */}
      <Card className="border-destructive/20">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Free-Tier Storage Usage
            <Badge variant={storagePercent > 80 ? 'destructive' : storagePercent > 60 ? 'secondary' : 'default'}>
              {storagePercent.toFixed(1)}%
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={storagePercent} className="h-3" />
          <p className="text-sm text-muted-foreground mt-2">
            {storagePercent > 80 ? (
              <>
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                Approaching limit — auto-pruning will activate at 90%
              </>
            ) : (
              'Healthy — plenty of space for new agents'
            )}
          </p>
        </CardContent>
      </Card>

      {/* Quick Actions & Recent Agents */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {quickActions.map((action) => (
              <Button
                key={action.name}
                variant="outline"
                className="w-full justify-start gap-3 text-left h-auto py-3"
                onClick={() => (window.location.href = action.href)}
              >
                <action.icon className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">{action.name}</p>
                  <p className="text-sm text-muted-foreground">{action.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recently Discovered Agents</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <a href="/library">View All</a>
            </Button>
          </CardHeader>
          <CardContent>
            {recentAgents?.agents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Brain className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No agents discovered yet</p>
                <Button className="mt-4" onClick={() => (window.location.href = '/harvester')}>
                  Run Auto-Discovery
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {recentAgents?.agents.map((agent: Agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => (window.location.href = `/library/${agent.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn('p-2 rounded-lg', agent.is_verified ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground')}>
                        <Brain className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium truncate max-w-[200px]">{agent.name}</p>
                        <p className="text-xs text-muted-foreground">{agent.platform} • {formatDate(agent.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={agent.is_verified ? 'default' : 'secondary'}>
                        {agent.quality_score}%
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Platform Distribution */}
      {agentStats?.by_platform && (
        <Card>
          <CardHeader>
            <CardTitle>Agents by Platform</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(agentStats.by_platform).map(([platform, count]) => (
                <Badge key={platform} variant="outline" className="gap-1">
                  {platform.charAt(0).toUpperCase() + platform.slice(1)}
                  <span className="bg-primary text-primary-foreground px-2 py-0.5 rounded-full text-xs">
                    {count}
                  </span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}