'use client';

import { useState, useEffect } from 'react';
import { Key, Plus, Copy, Trash2, Edit2, Filter, Download, Search, Eye, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';

export function VaultView() {
  const [credentials, setCredentials] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [env, setEnv] = useState('');
  const [showReveal, setShowReveal] = useState(false);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [revealedValue, setRevealedValue] = useState('');

  const [open, setOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState({
    name: '', provider: '', category: '', environment: 'development', tags: '', value: ''
  });

  useEffect(() => {
    loadCredentials();
    loadMetadata();
  }, []);

  const loadCredentials = async () => {
    setLoading(true);
    try {
      const data = await api.vaultApi.list({
        search: search || undefined,
        category: category || undefined,
        environment: env || undefined,
      });
      setCredentials(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadMetadata = async () => {
    try {
      const [catRes, provRes] = await Promise.all([
        api.vaultApi.categories(),
        api.vaultApi.providers(),
      ]);
      setCategories(catRes || []);
      setProviders(provRes || []);
    } catch (e) { console.error(e); }
  };

  const handleReveal = async (id: string) => {
    try {
      const data = await api.vaultApi.reveal(id);
      setRevealedId(data.id);
      setRevealedValue(data.value);
      setShowReveal(true);
    } catch (e) { alert('Failed to reveal credential'); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.vaultApi.create({
        name: formData.name,
        provider: formData.provider,
        category: formData.category || undefined,
        tags: formData.tags.split(',').map((t: string) => t.trim()).filter(Boolean),
        environment: formData.environment,
        value: formData.value,
      });
      setOpen(false);
      setFormData({ name: '', provider: '', category: '', environment: 'development', tags: '', value: '' });
      loadCredentials();
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Failed to create credential');
    } finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this credential?')) return;
    try {
      await api.vaultApi.delete(id);
      loadCredentials();
    } catch (e) { alert('Failed to delete'); }
  };

  const handleExport = async () => {
    try {
      const data = await api.vaultApi.export();
      const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data)], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'credentials.env';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert('Export failed'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API Vault</h1>
          <p className="text-muted-foreground mt-1">Secure credential management</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExport} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export .env
          </Button>
          <Button onClick={() => { setFormMode('create'); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Key
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-5">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search credentials..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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
            <div className="relative">
              <Input
                placeholder="Environment"
                value={env}
                onChange={(e) => setEnv(e.target.value)}
                className="pl-10"
              />
            </div>
            <div>
              <Button onClick={loadCredentials} className="w-full">Filter</Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground border-b border-border">
            <tr>
              <th className="pb-3 font-medium">Name</th>
              <th className="pb-3 font-medium">Provider</th>
              <th className="pb-3 font-medium">Category</th>
              <th className="pb-3 font-medium">Environment</th>
              <th className="pb-3 font-medium">Value</th>
              <th className="pb-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : credentials.length === 0 ? (
              <tr><td colSpan="6" className="py-8 text-center text-muted-foreground">No credentials found</td></tr>
            ) : (
              credentials.map((cred: any) => (
                <tr key={cred.id} className="border-b border-border/50">
                  <td className="py-3 font-medium">{cred.name}</td>
                  <td className="py-3">{cred.provider}</td>
                  <td className="py-3">{cred.category || '-'}</td>
                  <td className="py-3">
                    <Badge variant="secondary" className="text-xs">{cred.environment}</Badge>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground truncate max-w-xs">{'*'.repeat(20)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReveal(cred.id)}
                        className="p-1"
                        aria-label="Reveal value"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => { setFormData(cred as any); setFormMode('edit'); setOpen(true); }}>
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(cred.id)} className="p-1" aria-label="Delete">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{formMode === 'create' ? 'Add Credential' : 'Edit Credential'}</DialogTitle>
            <DialogDescription>Store an encrypted API key or secret</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Provider</label>
                <Input value={formData.provider} onChange={(e) => setFormData({...formData, provider: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <Input value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Environment</label>
                <select value={formData.environment} onChange={(e) => setFormData({...formData, environment: e.target.value})} className="border-input bg-background border rounded-md px-3 py-2 text-sm">
                  <option value="development">Development</option>
                  <option value="production">Production</option>
                  <option value="free-tier">Free Tier</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tags (comma separated)</label>
              <Input value={formData.tags} onChange={(e) => setFormData({...formData, tags: e.target.value})} placeholder="llm, search, production" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Secret Value</label>
              <Input type="password" value={formData.value} onChange={(e) => setFormData({...formData, value: e.target.value})} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showReveal} onOpenChange={setShowReveal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revealed Credential</DialogTitle>
            <DialogDescription>Handle this value securely</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Credential</label>
              <p className="font-medium">{revealedId}</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Value</label>
              <div className="flex items-center gap-2">
                <Input value={revealedValue} readOnly className="flex-1 font-mono text-xs" />
                <Button size="sm" onClick={() => {
                  navigator.clipboard.writeText(revealedValue);
                  alert('Copied to clipboard');
                }}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => { setShowReveal(false); setRevealedValue(''); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}