import { useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, Check, X } from 'lucide-react';
import { groupsApi } from '@/api';
import type { GroupRule } from '@/api/types';
import { useToast } from '@/hooks/use-toast';
import { validateRuleText } from '@/lib/groupSettings';

interface GroupRulesManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  onRulesChanged?: (rules: GroupRule[]) => void;
}

export const GroupRulesManagerDialog = ({
  open,
  onOpenChange,
  groupId,
  onRulesChanged,
}: GroupRulesManagerDialogProps) => {
  const [rules, setRules] = useState<GroupRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newRule, setNewRule] = useState('');
  const [newRuleError, setNewRuleError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const { toast } = useToast();

  const apply = (next: GroupRule[]) => {
    setRules(next);
    onRulesChanged?.(next);
  };

  const loadRules = useCallback(async () => {
    setLoading(true);
    const { data, error } = await groupsApi.getGroupRules(groupId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      const next = data || [];
      setRules(next);
      onRulesChanged?.(next);
    }
    setLoading(false);
  }, [groupId, onRulesChanged, toast]);

  useEffect(() => {
    if (open && groupId) {
      setNewRule('');
      setNewRuleError(null);
      setEditingId(null);
      setConfirmingId(null);
      loadRules();
    }
  }, [open, groupId, loadRules]);

  const handleAdd = async () => {
    const error = validateRuleText(newRule);
    setNewRuleError(error);
    if (error) return;
    setBusy(true);
    const { data, error: apiError } = await groupsApi.addGroupRule(groupId, newRule.trim());
    setBusy(false);
    if (apiError) {
      toast({ title: 'Error', description: apiError.message, variant: 'destructive' });
      return;
    }
    setNewRule('');
    apply(data || []);
  };

  const handleStartEdit = (rule: GroupRule) => {
    setEditingId(rule.id);
    setEditText(rule.rule_text);
    setConfirmingId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const error = validateRuleText(editText);
    if (error) {
      toast({ title: 'Invalid rule', description: error, variant: 'destructive' });
      return;
    }
    setBusy(true);
    const { data, error: apiError } = await groupsApi.updateGroupRule(groupId, editingId, editText.trim());
    setBusy(false);
    if (apiError) {
      toast({ title: 'Error', description: apiError.message, variant: 'destructive' });
      return;
    }
    setEditingId(null);
    setEditText('');
    apply(data || []);
  };

  const handleDelete = async (ruleId: string) => {
    setBusy(true);
    const { data, error } = await groupsApi.deleteGroupRule(groupId, ruleId);
    setBusy(false);
    setConfirmingId(null);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    apply(data || []);
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    const reordered = [...rules];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    apply(reordered);
    setBusy(true);
    const { data, error } = await groupsApi.reorderGroupRules(groupId, reordered.map((r) => r.id));
    setBusy(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      loadRules();
      return;
    }
    apply(data || []);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Group Rules</DialogTitle>
          <DialogDescription>
            Add, edit, reorder or delete the rules members see in "About this group".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <Input
                value={newRule}
                onChange={(e) => {
                  setNewRule(e.target.value);
                  if (newRuleError) setNewRuleError(null);
                }}
                placeholder="Write a new rule..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                aria-invalid={!!newRuleError}
              />
              {newRuleError && <p className="text-sm text-destructive mt-1">{newRuleError}</p>}
            </div>
            <Button type="button" onClick={handleAdd} disabled={busy}>
              <Plus className="h-4 w-4 mr-1" /> Add rule
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading rules...</p>
          ) : rules.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No rules have been added yet.</p>
          ) : (
            <div className="space-y-2">
              {rules.map((rule, index) => (
                <Card key={rule.id}>
                  <CardContent className="p-3 flex items-center gap-2">
                    <span className="text-sm text-muted-foreground w-5 text-right">{index + 1}.</span>
                    {editingId === rule.id ? (
                      <Input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="flex-1"
                        autoFocus
                      />
                    ) : (
                      <span className="flex-1 text-sm">{rule.rule_text}</span>
                    )}

                    {editingId === rule.id ? (
                      <>
                        <Button size="icon" variant="ghost" onClick={handleSaveEdit} disabled={busy}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(null);
                            setEditText('');
                          }}
                          disabled={busy}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : confirmingId === rule.id ? (
                      <>
                        <span className="text-xs text-muted-foreground">Delete?</span>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(rule.id)}
                          disabled={busy}
                        >
                          Delete
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmingId(null)}
                          disabled={busy}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleMove(index, -1)}
                          disabled={busy || index === 0}
                          aria-label="Move rule up"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleMove(index, 1)}
                          disabled={busy || index === rules.length - 1}
                          aria-label="Move rule down"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleStartEdit(rule)}
                          disabled={busy}
                          aria-label="Edit rule"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setConfirmingId(rule.id)}
                          disabled={busy}
                          aria-label="Delete rule"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GroupRulesManagerDialog;
