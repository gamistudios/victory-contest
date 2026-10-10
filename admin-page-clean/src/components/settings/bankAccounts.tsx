import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  bankServices,
  Bank,
  BankInput,
  describeApiError,
} from "@/services/bankServices";
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Loader2,
  Landmark,
} from "lucide-react";

const emptyForm: BankInput = {
  name: "",
  account_number: "",
  account_holder: "",
  description: "",
  display_order: 0,
  is_active: true,
};

export function BankAccountsSection() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Bank | null>(null);
  const [form, setForm] = useState<BankInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bank | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setBanks(await bankServices.listAll());
    } catch (e) {
      setError(describeApiError(e, "Loading payment methods"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (bank: Bank) => {
    setEditing(bank);
    setForm({
      name: bank.name,
      account_number: bank.account_number,
      account_holder: bank.account_holder ?? "",
      description: bank.description ?? "",
      display_order: bank.display_order ?? 0,
      is_active: bank.is_active,
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.account_number.trim()) {
      setFormError("Name and account number are required.");
      return;
    }
    setActionBusy(true);
    setFormError(null);
    try {
      if (editing) {
        await bankServices.update(editing.id, form);
      } else {
        await bankServices.create(form);
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      setFormError(describeApiError(e, editing ? "Updating payment method" : "Adding payment method"));
    } finally {
      setActionBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setActionBusy(true);
    try {
      await bankServices.remove(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setDeleteTarget(null);
      setError(describeApiError(e, "Deleting payment method"));
    } finally {
      setActionBusy(false);
    }
  };

  const toggleActive = async (bank: Bank) => {
    setActionBusy(true);
    setError(null);
    try {
      await bankServices.update(bank.id, {
        name: bank.name,
        account_number: bank.account_number,
        account_holder: bank.account_holder,
        description: bank.description,
        display_order: bank.display_order,
        is_active: !bank.is_active,
      });
      await load();
    } catch (e) {
      setError(describeApiError(e, "Updating payment method"));
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Landmark className="h-4 w-4" />
          Payment Methods
        </CardTitle>
        <CardDescription className="text-xs">
          Bank accounts students can pay with. Inactive methods are hidden on
          the student payment page.
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-4 space-y-3">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Add payment method
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : banks.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No payment methods configured yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Account #</TableHead>
                <TableHead>Holder</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {banks.map((bank) => (
                <TableRow key={bank.id}>
                  <TableCell className="font-medium">{bank.name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {bank.account_number}
                  </TableCell>
                  <TableCell>{bank.account_holder || "—"}</TableCell>
                  <TableCell>{bank.display_order}</TableCell>
                  <TableCell>
                    <Badge
                      variant={bank.is_active ? "default" : "secondary"}
                      className={
                        bank.is_active
                          ? "bg-green-100 text-green-700"
                          : "text-muted-foreground"
                      }
                    >
                      {bank.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleActive(bank)}
                        disabled={actionBusy}
                        className="h-8 px-2 text-xs"
                      >
                        {bank.is_active ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(bank)}
                        disabled={actionBusy}
                        className="h-8 w-8 p-0"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(bank)}
                        disabled={actionBusy}
                        className="h-8 w-8 p-0 text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Add / Edit dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit payment method" : "Add payment method"}</DialogTitle>
              <DialogDescription>
                These details appear to students when they choose a bank to
                pay with.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g., National Bank"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Account #</Label>
                  <Input
                    value={form.account_number}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, account_number: e.target.value }))
                    }
                    placeholder="1234 5678"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Account holder</Label>
                  <Input
                    value={form.account_holder}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, account_holder: e.target.value }))
                    }
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Display order</Label>
                  <Input
                    type="number"
                    value={form.display_order}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        display_order: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder="Optional note shown to students"
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="bank-active"
                  checked={form.is_active}
                  onCheckedChange={(c) =>
                    setForm((f) => ({ ...f, is_active: c === true }))
                  }
                />
                <Label htmlFor="bank-active" className="cursor-pointer text-sm">
                  Active (visible to students)
                </Label>
              </div>
              {formError && (
                <div className="text-xs text-red-600">{formError}</div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={actionBusy}>
                {actionBusy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {editing ? "Save changes" : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete payment method?</AlertDialogTitle>
              <AlertDialogDescription>
                "{deleteTarget?.name}" will no longer appear on the student
                payment page. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-red-fix-600 hover:bg-red-fix-700"
              >
                {actionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
