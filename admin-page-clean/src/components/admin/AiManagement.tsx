import { useState, useEffect } from 'react';
import {
  BrainCircuit,
  Plus,
  Edit,
  Trash2,
  Star,
  Zap,
  RefreshCw,
} from 'lucide-react';

import {
  aiServices,
  AIModel,
  AIProvider,
  AiProtocol,
  ProviderTestResult,
  describeApiError,
} from '@/services/aiServices';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const PROTOCOLS: { value: AiProtocol; label: string }[] = [
  { value: 'openai', label: 'OpenAI-compatible (/chat/completions)' },
  { value: 'anthropic', label: 'Anthropic (/v1/messages)' },
  { value: 'gemini', label: 'Gemini (/v1beta/models/...:generateContent)' },
];

// First model wins when no default_model is pinned (backend modelFor rule).
function activeModel(p: AIProvider): string {
  if (p.default_model && p.models.some((m) => m.name === p.default_model)) {
    return p.default_model;
  }
  return p.models[0]?.name ?? '—';
}

/** One editable row of the models editor: name + optional limits. Limits
 *  stay strings in the form and become numbers on submit ("" = unset =
 *  protocol default, backend treats 0 the same way). */
interface ModelFormRow {
  name: string;
  contextWindow: string;
  maxOutputTokens: string;
}

interface ProviderForm {
  name: string;
  protocol: AiProtocol;
  base_url: string;
  api_key: string;
  models: ModelFormRow[];
  enabled: boolean;
}

const EMPTY_FORM: ProviderForm = {
  name: '',
  protocol: 'openai',
  base_url: '',
  api_key: '',
  models: [{ name: '', contextWindow: '', maxOutputTokens: '' }],
  enabled: true,
};

export default function AiManagement() {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Global AI access switch (single settings row, require_premium).
  const [requirePremium, setRequirePremium] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Provider create/edit dialog.
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AIProvider | null>(null);
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete confirmation.
  const [deleteTarget, setDeleteTarget] = useState<AIProvider | null>(null);

  // Set-default dialog: pin which model the default provider uses.
  const [defaultTarget, setDefaultTarget] = useState<AIProvider | null>(null);
  const [defaultModel, setDefaultModel] = useState('');
  const [defaultSaving, setDefaultSaving] = useState(false);

  // Connection-test results, keyed by provider id.
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, ProviderTestResult>
  >({});

  useEffect(() => {
    fetchProviders();
    fetchSettings();
  }, []);

  const fetchProviders = async () => {
    try {
      setLoading(true);
      setError(null);
      setProviders(await aiServices.listProviders());
    } catch (e) {
      setError(describeApiError(e, 'Loading AI providers'));
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const s = await aiServices.getSettings();
      setRequirePremium(s.require_premium);
    } catch (e) {
      setSettingsError(describeApiError(e, 'Loading AI settings'));
    } finally {
      setSettingsLoading(false);
    }
  };

  const togglePremium = async (checked: boolean) => {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const s = await aiServices.putSettings({ require_premium: checked });
      setRequirePremium(s.require_premium);
    } catch (e) {
      setSettingsError(describeApiError(e, 'Saving AI settings'));
    } finally {
      setSettingsSaving(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (p: AIProvider) => {
    setEditing(p);
    setForm({
      name: p.name,
      protocol: p.protocol,
      base_url: p.base_url,
      api_key: '',
      models: p.models.map((m) => ({
        name: m.name,
        contextWindow: m.context_window ? String(m.context_window) : '',
        maxOutputTokens: m.max_output_tokens ? String(m.max_output_tokens) : '',
      })),
      enabled: p.enabled,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const submitForm = async () => {
    if (!form.name.trim() || !form.base_url.trim()) {
      setFormError('name and base_url are required.');
      return;
    }
    const models: AIModel[] = [];
    for (const row of form.models) {
      if (!row.name.trim()) continue;
      const context = row.contextWindow.trim() ? Number(row.contextWindow) : 0;
      const maxOut = row.maxOutputTokens.trim() ? Number(row.maxOutputTokens) : 0;
      if (Number.isNaN(context) || context < 0 || Number.isNaN(maxOut) || maxOut < 0) {
        setFormError(`Model "${row.name}": context and max output tokens must be non-negative numbers.`);
        return;
      }
      models.push({
        name: row.name.trim(),
        ...(context ? { context_window: context } : {}),
        ...(maxOut ? { max_output_tokens: maxOut } : {}),
      });
    }
    if (models.length === 0) {
      setFormError('At least one model with a name is required.');
      return;
    }
    if (!editing && !form.api_key.trim()) {
      setFormError('api_key is required when creating a provider.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const input = {
        name: form.name.trim(),
        base_url: form.base_url.trim(),
        protocol: form.protocol,
        models,
        enabled: form.enabled,
        // Empty key on PUT keeps the stored key server-side.
        ...(form.api_key.trim() ? { api_key: form.api_key.trim() } : {}),
      };
      if (editing) {
        await aiServices.updateProvider(editing.id, input);
      } else {
        await aiServices.createProvider(input);
      }
      setFormOpen(false);
      await fetchProviders();
    } catch (e) {
      setFormError(describeApiError(e, editing ? 'Updating provider' : 'Creating provider'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setError(null);
      await aiServices.deleteProvider(deleteTarget.id);
      setDeleteTarget(null);
      await fetchProviders();
    } catch (e) {
      setError(describeApiError(e, 'Deleting provider'));
    }
  };

  const runTest = async (p: AIProvider) => {
    setTestingId(p.id);
    try {
      const res = await aiServices.testProvider(p.id);
      setTestResults((prev) => ({ ...prev, [p.id]: res }));
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [p.id]: { ok: false, message: describeApiError(e, 'Testing provider') },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const openSetDefault = (p: AIProvider) => {
    setDefaultTarget(p);
    setDefaultModel(p.default_model || p.models[0]?.name || '');
  };

  const submitSetDefault = async () => {
    if (!defaultTarget) return;
    setDefaultSaving(true);
    try {
      setError(null);
      await aiServices.setDefault(defaultTarget.id, defaultModel);
      setDefaultTarget(null);
      await fetchProviders();
    } catch (e) {
      setError(describeApiError(e, 'Setting default provider'));
    } finally {
      setDefaultSaving(false);
    }
  };

  const clearDefault = async (p: AIProvider) => {
    try {
      setError(null);
      await aiServices.clearDefault(p.id);
      await fetchProviders();
    } catch (e) {
      setError(describeApiError(e, 'Clearing default provider'));
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <BrainCircuit className="h-6 w-6 text-[#00AB55]" />
        <h1 className="text-xl font-bold">AI Management</h1>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={fetchProviders}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">AI access</CardTitle>
          <CardDescription className="text-xs">
            Restrict student AI features (practice, explanations) to premium
            students only. Applies globally, not per provider.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2 pb-3">
          <Checkbox
            id="require-premium"
            checked={requirePremium}
            disabled={settingsLoading || settingsSaving}
            onCheckedChange={(c) => togglePremium(c === true)}
          />
          <Label htmlFor="require-premium" className="cursor-pointer text-sm font-normal">
            Require premium for AI features
          </Label>
          {settingsSaving && (
            <RefreshCw className="ml-2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </CardContent>
        {settingsError && (
          <div className="px-4 pb-3 text-xs text-red-600">{settingsError}</div>
        )}
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Providers</CardTitle>
          <CardDescription className="text-xs">
            Admin-managed LLM endpoints. Student AI calls use the default
            provider; otherwise the oldest enabled one. API keys are write-only
            — only a last-4 hint comes back.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-3">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : providers.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No AI providers configured yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Protocol</TableHead>
                  <TableHead>Base URL</TableHead>
                  <TableHead>Models</TableHead>
                  <TableHead>API key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{p.protocol}</Badge>
                    </TableCell>
                    <TableCell className="max-w-45 truncate font-mono text-xs" title={p.base_url}>
                      {p.base_url}
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.models.length} configured
                      <span className="block text-muted-foreground">
                        active: {activeModel(p)}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {p.has_api_key ? p.api_key_hint || '…set' : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {p.is_default && (
                          <Badge className="gap-1">
                            <Star className="h-3 w-3" /> Default
                          </Badge>
                        )}
                        <Badge variant={p.enabled ? 'default' : 'secondary'}>
                          {p.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => runTest(p)}
                        disabled={testingId !== null}
                        title="Send a tiny prompt through this provider"
                      >
                        <Zap className={`h-4 w-4 ${testingId === p.id ? 'animate-pulse' : ''}`} />
                      </Button>
                      {p.is_default ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => clearDefault(p)}
                          title="Clear default"
                        >
                          <Star className="h-4 w-4 fill-current text-yellow-500" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openSetDefault(p)}
                          title="Set as default"
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(p)}
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => setDeleteTarget(p)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="mt-3 flex items-center justify-between">
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> Add provider
            </Button>
          </div>
        </CardContent>
      </Card>

      {Object.entries(testResults).map(([id, res]) => (
        <Alert key={id} variant={res.ok ? 'default' : 'destructive'}>
          <AlertDescription>
            <span className="font-semibold">
              {providers.find((p) => p.id === id)?.name ?? id}:
            </span>{' '}
            {res.message}
          </AlertDescription>
        </Alert>
      ))}

      {/* Create / edit provider */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editing ? `Edit provider — ${editing.name}` : 'Add provider'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              The protocol decides the wire format: OpenAI-compatible posts to
              base_url/chat/completions, Anthropic to base_url/v1/messages,
              Gemini to base_url/v1beta/models/{'{model}'}:generateContent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="p-name">Name</Label>
              <Input
                id="p-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Gemini main"
              />
            </div>
            <div className="space-y-1">
              <Label>Protocol</Label>
              <Select
                value={form.protocol}
                onValueChange={(v) => setForm({ ...form, protocol: v as AiProtocol })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROTOCOLS.map((pr) => (
                    <SelectItem key={pr.value} value={pr.value}>
                      {pr.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-url">Base URL</Label>
              <Input
                id="p-url"
                value={form.base_url}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                placeholder="https://generativelanguage.googleapis.com"
              />
              <p className="text-xs text-muted-foreground">
                https required (http only for localhost); no embedded credentials.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-key">API key</Label>
              <Input
                id="p-key"
                type="password"
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                placeholder={
                  editing
                    ? `stored (${editing.api_key_hint || 'unknown'}) — leave empty to keep`
                    : 'sk-...'
                }
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Models</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm({
                      ...form,
                      models: [
                        ...form.models,
                        { name: '', contextWindow: '', maxOutputTokens: '' },
                      ],
                    })
                  }
                >
                  Add model
                </Button>
              </div>
              <div className="space-y-2">
                {form.models.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr_5rem_5rem_auto] items-center gap-2">
                    <Input
                      value={row.name}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          models: form.models.map((r, j) =>
                            j === i ? { ...r, name: e.target.value } : r
                          ),
                        })
                      }
                      placeholder="model id, e.g. gemini-2.5-flash"
                    />
                    <Input
                      value={row.contextWindow}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          models: form.models.map((r, j) =>
                            j === i ? { ...r, contextWindow: e.target.value } : r
                          ),
                        })
                      }
                      placeholder="context"
                      title="Context window (tokens), optional"
                    />
                    <Input
                      value={row.maxOutputTokens}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          models: form.models.map((r, j) =>
                            j === i ? { ...r, maxOutputTokens: e.target.value } : r
                          ),
                        })
                      }
                      placeholder="max out"
                      title="Max output tokens, optional"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={form.models.length <= 1}
                      onClick={() =>
                        setForm({
                          ...form,
                          models: form.models.filter((_, j) => j !== i),
                        })
                      }
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Optional per-model limits in tokens: context window and max
                output. The backend clamps generation to them.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="p-enabled"
                checked={form.enabled}
                onCheckedChange={(c) => setForm({ ...form, enabled: c === true })}
              />
              <Label htmlFor="p-enabled" className="cursor-pointer text-sm font-normal">
                Enabled
              </Label>
            </div>
            {formError && <p className="text-xs text-red-600">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitForm} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create provider'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set default provider + model pin */}
      <Dialog
        open={defaultTarget !== null}
        onOpenChange={(o) => !o && setDefaultTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              Set default: {defaultTarget?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Student AI calls will use this provider. Choosing a model pins it
              as the default; otherwise the provider's first model is used.
            </DialogDescription>
          </DialogHeader>
          <Separator />
          <Select value={defaultModel} onValueChange={setDefaultModel}>
            <SelectTrigger>
              <SelectValue placeholder="First model" />
            </SelectTrigger>
            <SelectContent>
              {defaultTarget?.models.map((m) => (
                <SelectItem key={m.name} value={m.name}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDefaultTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitSetDefault} disabled={defaultSaving}>
              {defaultSaving ? 'Setting…' : 'Set default'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete provider “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the stored endpoint and its API key permanently. If it
              was the default, AI calls fall back to the oldest enabled provider.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
