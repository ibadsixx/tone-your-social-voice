import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { isOnline } from '@/hooks/usePresence';
import { groupsApi } from '@/api';
import type { GroupModerationActionRow, GroupRule } from '@/api/types';
import type {
  GroupBanRow,
  EnrichedGroupMember,
  GroupMemberAccess,
  GroupRestrictionType,
} from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Ban,
  Flag,
  Loader2,
  Lock,
  MessageSquareOff,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  Unlock,
  User,
  UserX,
} from 'lucide-react';
import {
  BAN_DURATION_PRESETS,
  RESTRICT_DURATION_PRESETS,
  GROUP_REPORT_REASONS,
  GROUP_RESTRICTION_TYPES,
  computeMemberActions,
  formatDuration,
  formatEndsAt,
  groupRoleLabel,
  isActiveBan,
  isModeratorAccess,
  moderationActionLabel,
  resolveEndsAt,
  type RestrictionOption,
} from '@/lib/groupMembers';

interface GroupMembersTabProps {
  groupId: string;
  groupName: string;
  groupCreatedBy: string | null;
  rulesEnabled: boolean;
  onChanged?: () => void;
}

const memberName = (m: EnrichedGroupMember | GroupBanRow): string => {
  const p = m.profiles;
  return p?.display_name || p?.username || 'Unknown User';
};

const memberUsername = (m: EnrichedGroupMember | GroupBanRow): string | null =>
  m.profiles?.username ?? null;

interface ActionResult {
  ok: boolean;
}

interface ModerationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  rules: GroupRule[];
  onSubmit: () => Promise<ActionResult>;
  children: React.ReactNode;
  submitLabel: string;
}

const ModerationFormDialog = ({
  open,
  onOpenChange,
  title,
  description,
  rules,
  onSubmit,
  children,
  submitLabel,
}: ModerationFormDialogProps) => {
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    const { ok } = await onSubmit();
    setSubmitting(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-4 py-2">{children}</div>
        {rules.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Optional: link an action to a group rule so it shows in this group's moderation history.
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Working...
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface RuleSelectProps {
  rules: GroupRule[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
}

const RuleSelect = ({ rules, value, onChange, label, id, disabled }: RuleSelectProps) => (
  <div>
    <Label htmlFor={id}>{label || 'Group rule (optional)'}</Label>
    <Select value={value} onValueChange={onChange} disabled={disabled || rules.length === 0}>
      <SelectTrigger id={id} className="mt-1.5 w-full">
        <SelectValue placeholder={rules.length === 0 ? 'No rules yet' : 'None — leave unlinked'} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">None — leave unlinked</SelectItem>
        {rules.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {r.rule_text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

// --- Remove member ---

interface RemoveMemberDialogProps {
  member: EnrichedGroupMember | null;
  groupName: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (member: EnrichedGroupMember, reason: string) => Promise<ActionResult>;
}

const RemoveMemberDialog = ({ member, groupName, onOpenChange, onSubmit }: RemoveMemberDialogProps) => {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (member) setReason('');
  }, [member]);

  return (
    <AlertDialog open={!!member} onOpenChange={(open) => { if (!open) onOpenChange(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {member ? memberName(member) : 'member'}?</AlertDialogTitle>
          <AlertDialogDescription>
            Removing a member takes away their access to {groupName}. They can rejoin later. This is
            different from banning — a ban blocks them from rejoining while it is active.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="remove-reason">Reason (optional)</Label>
          <Textarea
            id="remove-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Visible in the moderation history"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={async (e) => {
              e.preventDefault();
              if (!member) return;
              const { ok } = await onSubmit(member, reason.trim());
              if (ok) onOpenChange(false);
            }}
          >
            Remove member
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// --- Report member ---

interface ReportMemberDialogProps {
  member: EnrichedGroupMember | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (member: EnrichedGroupMember, reason: string, description: string) => Promise<ActionResult>;
}

const ReportMemberDialog = ({ member, onOpenChange, onSubmit }: ReportMemberDialogProps) => {
  const [reason, setReason] = useState(GROUP_REPORT_REASONS[0].value);
  const [description, setDescription] = useState('');
  useEffect(() => {
    if (member) {
      setReason(GROUP_REPORT_REASONS[0].value);
      setDescription('');
    }
  }, [member]);

  return (
    <ModerationFormDialog
      open={!!member}
      onOpenChange={onOpenChange}
      title={member ? `Report ${memberName(member)}` : 'Report member'}
      description="Reports are sent to this group's moderators and reviewers. They cannot see who reported them."
      rules={[]}
      submitLabel="Submit report"
      onSubmit={async () => {
        if (!member) return { ok: false };
        return onSubmit(member, reason, description.trim());
      }}
    >
      <div>
        <Label htmlFor="report-reason">Reason</Label>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger id="report-reason" className="mt-1.5 w-full">
            <SelectValue placeholder="Choose a reason" />
          </SelectTrigger>
          <SelectContent>
            {GROUP_REPORT_REASONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="report-description">Details (optional)</Label>
        <Textarea
          id="report-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Tell the moderators what happened..."
        />
      </div>
    </ModerationFormDialog>
  );
};

// --- Restrict member ---

interface RestrictMemberDialogProps {
  member: EnrichedGroupMember | null;
  initialType: GroupRestrictionType;
  rules: GroupRule[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    member: EnrichedGroupMember,
    input: { restriction_type: GroupRestrictionType; ends_at: string | null; reason: string; rule_id: string | null }
  ) => Promise<ActionResult>;
}

const RestrictMemberDialog = ({ member, initialType, rules, onOpenChange, onSubmit }: RestrictMemberDialogProps) => {
  const [type, setType] = useState<GroupRestrictionType>(initialType);
  const [duration, setDuration] = useState<RestrictionOption>(RESTRICT_DURATION_PRESETS[0]);
  const [customHours, setCustomHours] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [ruleId, setRuleId] = useState('none');

  useEffect(() => {
    if (member) {
      setType(initialType);
      setDuration(RESTRICT_DURATION_PRESETS[0]);
      setCustomHours(null);
      setReason('');
      setRuleId('none');
    }
  }, [member, initialType]);

  const endsAt = resolveEndsAt(duration, customHours);

  return (
    <ModerationFormDialog
      open={!!member}
      onOpenChange={onOpenChange}
      title={member ? `Restrict ${memberName(member)}` : 'Restrict member'}
      description={
        type === 'posting'
          ? 'They can still view the group but will not be able to share posts until the restriction ends.'
          : 'Blocks all interactions with the group for the selected duration.'
      }
      rules={rules}
      submitLabel="Apply restriction"
      onSubmit={async () => {
        if (!member) return { ok: false };
        return onSubmit(member, {
          restriction_type: type,
          ends_at: endsAt,
          reason: reason.trim(),
          rule_id: ruleId === 'none' ? null : ruleId,
        });
      }}
    >
      <div>
        <Label htmlFor="restrict-type">Restriction</Label>
        <Select value={type} onValueChange={(v) => setType(v as GroupRestrictionType)}>
          <SelectTrigger id="restrict-type" className="mt-1.5 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUP_RESTRICTION_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          {GROUP_RESTRICTION_TYPES.find((t) => t.value === type)?.description}
        </p>
      </div>
      <div>
        <Label htmlFor="restrict-duration">Duration</Label>
        <Select
          value={duration.kind === 'custom' ? 'custom' : duration.label}
          onValueChange={(v) => {
            const opt = RESTRICT_DURATION_PRESETS.find((d) => d.label === v) ?? null;
            setDuration(opt ?? { label: 'Custom', kind: 'custom' });
            if (opt) setCustomHours(null);
          }}
        >
          <SelectTrigger id="restrict-duration" className="mt-1.5 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESTRICT_DURATION_PRESETS.map((d) => (
              <SelectItem key={d.label} value={d.label}>
                {d.label}
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {duration.kind === 'custom' && (
        <div>
          <Label htmlFor="restrict-custom">Duration in hours</Label>
          <Input
            id="restrict-custom"
            type="number"
            min={1}
            max={8760}
            value={customHours ?? ''}
            onChange={(e) => setCustomHours(Number(e.target.value) || null)}
            placeholder="e.g. 48"
            className="mt-1.5"
          />
        </div>
      )}
      {endsAt ? (
        <p className="text-xs text-muted-foreground">Ends {formatEndsAt(endsAt)}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Permanent — no end date.</p>
      )}
      <div>
        <Label htmlFor="restrict-reason">Reason (optional)</Label>
        <Textarea
          id="restrict-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Why is this member being restricted?"
        />
      </div>
      <RuleSelect rules={rules} value={ruleId} onChange={setRuleId} id="restrict-rule" />
    </ModerationFormDialog>
  );
};

// --- Ban member ---

interface BanMemberDialogProps {
  member: EnrichedGroupMember | null;
  rules: GroupRule[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    member: EnrichedGroupMember,
    input: { ends_at: string | null; reason: string; rule_id: string | null }
  ) => Promise<ActionResult>;
}

const BanMemberDialog = ({ member, rules, onOpenChange, onSubmit }: BanMemberDialogProps) => {
  const [duration, setDuration] = useState<RestrictionOption>(BAN_DURATION_PRESETS[0]);
  const [customHours, setCustomHours] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [ruleId, setRuleId] = useState('none');

  useEffect(() => {
    if (member) {
      setDuration(BAN_DURATION_PRESETS[0]);
      setCustomHours(null);
      setReason('');
      setRuleId('none');
    }
  }, [member]);

  const endsAt = resolveEndsAt(duration, customHours);

  return (
    <ModerationFormDialog
      open={!!member}
      onOpenChange={onOpenChange}
      title={member ? `Ban ${memberName(member)}?` : 'Ban member'}
      description="Banning removes their membership and prevents them from rejoining while the ban is active. This is different from removing a member."
      rules={rules}
      submitLabel="Ban member"
      onSubmit={async () => {
        if (!member) return { ok: false };
        return onSubmit(member, {
          ends_at: endsAt,
          reason: reason.trim(),
          rule_id: ruleId === 'none' ? null : ruleId,
        });
      }}
    >
      <div>
        <Label htmlFor="ban-duration">Duration</Label>
        <Select
          value={duration.kind === 'custom' ? 'custom' : duration.label}
          onValueChange={(v) => {
            const opt = BAN_DURATION_PRESETS.find((d) => d.label === v) ?? null;
            setDuration(opt ?? { label: 'Custom', kind: 'custom' });
            if (opt) setCustomHours(null);
          }}
        >
          <SelectTrigger id="ban-duration" className="mt-1.5 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BAN_DURATION_PRESETS.map((d) => (
              <SelectItem key={d.label} value={d.label}>
                {d.label}
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {duration.kind === 'custom' && (
        <div>
          <Label htmlFor="ban-custom">Ban duration in hours</Label>
          <Input
            id="ban-custom"
            type="number"
            min={1}
            max={8760}
            value={customHours ?? ''}
            onChange={(e) => setCustomHours(Number(e.target.value) || null)}
            placeholder="e.g. 72"
            className="mt-1.5"
          />
        </div>
      )}
      {endsAt ? (
        <p className="text-xs text-muted-foreground">Ban ends {formatEndsAt(endsAt)}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Permanent ban — no end date.</p>
      )}
      <div>
        <Label htmlFor="ban-reason">Reason (optional)</Label>
        <Textarea
          id="ban-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Why is this member being banned?"
        />
      </div>
      <RuleSelect rules={rules} value={ruleId} onChange={setRuleId} id="ban-rule" />
    </ModerationFormDialog>
  );
};

// --- Single-item confirmations (lift restriction / unban) ---

interface SimpleConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: () => Promise<ActionResult>;
}

const SimpleConfirmDialog = ({ open, onOpenChange, title, description, submitLabel, onSubmit }: SimpleConfirmDialogProps) => {
  const [submitting, setSubmitting] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting}
            onClick={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              const { ok } = await onSubmit();
              setSubmitting(false);
              if (ok) onOpenChange(false);
            }}
          >
            {submitting ? 'Working...' : submitLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// --- Main tab ---

const GroupMembersTab = ({ groupId, groupName, groupCreatedBy, rulesEnabled, onChanged }: GroupMembersTabProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [yourAccess, setYourAccess] = useState<GroupMemberAccess>('none');
  const [members, setMembers] = useState<EnrichedGroupMember[]>([]);
  const [banned, setBanned] = useState<GroupBanRow[]>([]);
  const [moderation, setModeration] = useState<GroupModerationActionRow[]>([]);
  const [search, setSearch] = useState('');
  const [rules, setRules] = useState<GroupRule[]>([]);

  const [removeTarget, setRemoveTarget] = useState<EnrichedGroupMember | null>(null);
  const [reportTarget, setReportTarget] = useState<EnrichedGroupMember | null>(null);
  const [restrictTarget, setRestrictTarget] = useState<EnrichedGroupMember | null>(null);
  const [restrictType, setRestrictType] = useState<GroupRestrictionType>('posting');
  const [banTarget, setBanTarget] = useState<EnrichedGroupMember | null>(null);
  const [unrestrictTarget, setUnrestrictTarget] = useState<EnrichedGroupMember | null>(null);
  const [unbanRow, setUnbanRow] = useState<GroupBanRow | null>(null);

  const loadRules = async () => {
    if (!rulesEnabled) {
      setRules([]);
      return;
    }
    const { data } = await groupsApi.getGroupRules(groupId);
    if (data) setRules(data);
  };

  const load = async (): Promise<boolean> => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await groupsApi.getGroupMembersSecure(groupId);
    if (err || !data || data.status !== 'ok') {
      setLoading(false);
      setError(err?.message || 'Failed to load members');
      return false;
    }
    setYourAccess(data.your_access);
    setMembers(data.members ?? []);
    setBanned((data.banned ?? []).filter((b) => isActiveBan(b)));
    setModeration(data.moderation ?? []);
    setLoading(false);
    return true;
  };

  useEffect(() => {
    load();
    loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, rulesEnabled]);

  const runAction = async (
    fn: () => Promise<{ data: { status: string; message?: string } | null; error: { message: string } | null }>,
    successMessage: string
  ): Promise<ActionResult> => {
    const { data, error: err } = await fn();
    if (err || !data || data.status !== 'ok') {
      toast({
        title: 'Error',
        description: err?.message || data?.message || 'Something went wrong',
        variant: 'destructive',
      });
      return { ok: false };
    }
    toast({ title: 'Done', description: successMessage });
    await load();
    onChanged?.();
    return { ok: true };
  };

  const callerIsModerator = isModeratorAccess(yourAccess);

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return members;
    const q = search.toLowerCase();
    return members.filter(
      (m) =>
        memberName(m).toLowerCase().includes(q) ||
        (memberUsername(m) || '').toLowerCase().includes(q)
    );
  }, [members, search]);

  const rulesMap = useMemo(() => new Map(rules.map((r) => [r.id, r.rule_text])), [rules]);

  const openProfile = (m: EnrichedGroupMember | GroupBanRow) => {
    navigate(`/profile/${memberUsername(m) || m.user_id}`);
  };

  const renderMemberMenu = (member: EnrichedGroupMember) => {
    const actions = computeMemberActions(member, {
      callerAccess: yourAccess,
      callerUserId: user?.id,
      groupCreatedBy,
    });
    const hasAny =
      actions.viewProfile || actions.report || actions.remove ||
      actions.restrictPosting || actions.restrictAll || actions.unrestrict;
    if (!hasAny) return null;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Actions for ${memberName(member)}`}
          >
            <MoreHorizontal className="h-4 w-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuLabel>{memberName(member)}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {actions.viewProfile && (
            <DropdownMenuItem onClick={() => openProfile(member)}>
              <User className="h-4 w-4" /> View profile
            </DropdownMenuItem>
          )}
          {actions.report && (
            <DropdownMenuItem onClick={() => setReportTarget(member)}>
              <Flag className="h-4 w-4" /> Report member
            </DropdownMenuItem>
          )}
          {actions.unrestrict && (
            <DropdownMenuItem onClick={() => setUnrestrictTarget(member)}>
              <Unlock className="h-4 w-4" /> Lift restriction
            </DropdownMenuItem>
          )}
          {actions.restrictPosting && (
            <DropdownMenuItem onClick={() => { setRestrictType('posting'); setRestrictTarget(member); }}>
              <MessageSquareOff className="h-4 w-4" /> Restrict posting
            </DropdownMenuItem>
          )}
          {actions.restrictAll && (
            <DropdownMenuItem onClick={() => { setRestrictType('all'); setRestrictTarget(member); }}>
              <Lock className="h-4 w-4" /> Restrict member
            </DropdownMenuItem>
          )}
          {actions.remove && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => setRemoveTarget(member)}>
                <UserX className="h-4 w-4" /> Remove member
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem className="text-destructive" onClick={() => setBanTarget(member)}>
            <Ban className="h-4 w-4" /> Ban
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const renderBannedMenu = (ban: GroupBanRow) => {
    if (!callerIsModerator) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Actions for ${memberName(ban)}`}
          >
            <MoreHorizontal className="h-4 w-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuLabel>{memberName(ban)}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => openProfile(ban)}>
            <User className="h-4 w-4" /> View profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setUnbanRow(ban)}>
            <ShieldCheck className="h-4 w-4" /> Unban member
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const statusBadge = (member: EnrichedGroupMember) => {
    if (member.status === 'posting_restricted') {
      return (
        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50 shrink-0">
          Posting restricted
        </Badge>
      );
    }
    if (member.status === 'restricted') {
      return (
        <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 bg-orange-50 shrink-0">
          Restricted
        </Badge>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <Card>
          <CardContent className="py-10 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => load()}>
              <RefreshCw className="h-4 w-4 mr-2" /> Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">Members · {members.length}</h3>
            <div className="relative w-52">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members"
                className="pl-9 h-9"
              />
            </div>
          </div>

          {!callerIsModerator && (
            <p className="text-xs text-muted-foreground">
              Only the group owner and moderators can remove, restrict, or ban members.
            </p>
          )}

          <Card>
            <CardContent className="p-2 sm:p-4">
              {filteredMembers.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  {search ? 'No members match your search.' : 'No members yet'}
                </p>
              ) : (
                <ul className="divide-y">
                  {filteredMembers.map((member) => {
                    const online = isOnline(member.profiles?.last_seen_at);
                    return (
                      <li
                        key={member.user_id}
                        className="flex items-center gap-3 py-2.5 px-2 rounded-lg cursor-pointer hover:bg-muted/60 transition-colors"
                        onClick={() => openProfile(member)}
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={member.profiles?.profile_pic ?? undefined} alt="" />
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {memberName(member)[0]}
                          </AvatarFallback>
                          {online && (
                            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
                          )}
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{memberName(member)}</p>
                            {member.user_id === groupCreatedBy && (
                              <Badge variant="default" className="text-[10px] px-1.5 py-0 shrink-0">Owner</Badge>
                            )}
                            {member.user_id === user?.id && (
                              <span className="text-xs text-muted-foreground shrink-0">(you)</span>
                            )}
                          </div>
                          {member.profiles?.username && (
                            <p className="text-xs text-muted-foreground truncate">@{member.profiles.username}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {statusBadge(member)}
                          <Badge variant={member.role === 'admin' ? 'secondary' : 'outline'} className="text-xs shrink-0">
                            {groupRoleLabel(member.role)}
                          </Badge>
                          {renderMemberMenu(member)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!loading && !error && callerIsModerator && banned.length > 0 && (
        <Card>
          <CardContent className="p-2 sm:p-4">
            <h3 className="font-semibold mb-2 px-2">Banned members · {banned.length}</h3>
            <ul className="divide-y">
              {banned.map((ban) => (
                <li
                  key={ban.id}
                  className="flex items-center gap-3 py-2.5 px-2 rounded-lg cursor-pointer hover:bg-muted/60 transition-colors"
                  onClick={() => openProfile(ban)}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={ban.profiles?.profile_pic ?? undefined} alt="" />
                    <AvatarFallback className="bg-primary/10 text-primary">{memberName(ban)[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{memberName(ban)}</p>
                    {ban.profiles?.username && (
                      <p className="text-xs text-muted-foreground truncate">@{ban.profiles.username}</p>
                    )}
                    {ban.reason && (
                      <p className="text-xs text-muted-foreground truncate">Reason: {ban.reason}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant="destructive" className="text-[10px]">Banned</Badge>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{formatDuration(ban.expires_at)}</p>
                  </div>
                  {renderBannedMenu(ban)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {!loading && !error && callerIsModerator && moderation.length > 0 && (
        <Card>
          <CardContent className="p-2 sm:p-4">
            <h3 className="font-semibold mb-2 px-2">Moderation history</h3>
            <ul className="divide-y">
              {moderation.slice(0, 20).map((entry) => {
                const target =
                  entry.target_profile?.display_name || entry.target_profile?.username || 'a member';
                const actor = entry.actor_profile?.display_name || entry.actor_profile?.username || 'a moderator';
                const ruleText = entry.rule_id ? rulesMap.get(entry.rule_id) : null;
                return (
                  <li key={entry.id} className="py-2.5 px-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {moderationActionLabel(entry.action)}
                      </Badge>
                      <span className="font-medium truncate">{target}</span>
                      <span className="text-muted-foreground text-xs">by {actor}</span>
                      <span className="text-muted-foreground text-xs ml-auto">
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </div>
                    {(entry.reason || ruleText) && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {entry.reason}
                        {entry.reason && ruleText ? ' · ' : ''}
                        {ruleText ? `Rule: ${ruleText}` : ''}
                      </p>
                    )}
                    {entry.ends_at && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Duration: {formatDuration(entry.ends_at)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <RemoveMemberDialog
        member={removeTarget}
        groupName={groupName}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
        onSubmit={(member, reason) =>
          runAction(
            () => groupsApi.removeGroupMemberSecure(groupId, member.user_id, reason),
            `${memberName(member)} was removed from the group.`
          )
        }
      />

      <ReportMemberDialog
        member={reportTarget}
        onOpenChange={(open) => { if (!open) setReportTarget(null); }}
        onSubmit={(member, reason, description) =>
          runAction(
            () => groupsApi.reportGroupMemberSecure(groupId, member.user_id, { reason, description }),
            `Report sent for ${memberName(member)}.`
          )
        }
      />

      <RestrictMemberDialog
        member={restrictTarget}
        initialType={restrictType}
        rules={rules}
        onOpenChange={(open) => { if (!open) setRestrictTarget(null); }}
        onSubmit={(member, input) =>
          runAction(
            () => groupsApi.restrictGroupMemberSecure(groupId, member.user_id, input),
            input.restriction_type === 'posting'
              ? `${memberName(member)} can no longer post in the group.`
              : `${memberName(member)} is now restricted in the group.`
          )
        }
      />

      <BanMemberDialog
        member={banTarget}
        rules={rules}
        onOpenChange={(open) => { if (!open) setBanTarget(null); }}
        onSubmit={(member, input) =>
          runAction(
            () => groupsApi.banGroupMemberSecure(groupId, member.user_id, input),
            `${memberName(member)} was banned from the group.`
          )
        }
      />

      <SimpleConfirmDialog
        open={!!unrestrictTarget}
        onOpenChange={(open) => { if (!open) setUnrestrictTarget(null); }}
        title={unrestrictTarget ? `Lift restriction on ${memberName(unrestrictTarget)}?` : 'Lift restriction'}
        description="Their access to this group will be restored immediately."
        submitLabel="Lift restriction"
        onSubmit={() => {
          if (!unrestrictTarget) return Promise.resolve({ ok: false });
          const member = unrestrictTarget;
          return runAction(
            () => groupsApi.unrestrictGroupMemberSecure(groupId, member.user_id),
            `Restriction lifted for ${memberName(member)}.`
          );
        }}
      />

      <SimpleConfirmDialog
        open={!!unbanRow}
        onOpenChange={(open) => { if (!open) setUnbanRow(null); }}
        title={unbanRow ? `Unban ${memberName(unbanRow)}?` : 'Unban member'}
        description="The ban will be revoked. This does not re-add them — they can rejoin through the normal join flow."
        submitLabel="Unban member"
        onSubmit={() => {
          if (!unbanRow) return Promise.resolve({ ok: false });
          const ban = unbanRow;
          return runAction(
            () => groupsApi.unbanGroupMemberSecure(groupId, ban.user_id),
            `${memberName(ban)} was unbanned.`
          );
        }}
      />
    </div>
  );
};

export default GroupMembersTab;