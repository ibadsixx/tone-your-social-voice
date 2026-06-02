import React, { useState, useEffect, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronRight, Plus, ArrowLeft, Save, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

type SubView = 'main' | 'contact' | 'birthday' | 'profile-detail' | 'display-name' | 'username';

const ProfilesAndPersonalDetails: React.FC = () => {
  const { user } = useAuth();
  const { profile, loading } = useProfile();
  const { toast } = useToast();
  const [subView, setSubView] = useState<SubView>('main');

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [nameErrors, setNameErrors] = useState({ firstName: false, lastName: false });
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (nameErrors.firstName) firstNameRef.current?.focus();
    else if (nameErrors.lastName) lastNameRef.current?.focus();
  }, [nameErrors]);

  useEffect(() => {
    if (user) setEmail(user.email || '');
    if (profile) {
      setBirthday(profile.birthday || '');
      setUsername(profile.username || '');
      const parts = (profile.display_name || '').split(' ');
      setFirstName(parts[0] || '');
      setLastName(parts.length > 1 ? parts[parts.length - 1] : '');
      setMiddleName(parts.length > 2 ? parts.slice(1, -1).join(' ') : '');
    }
  }, [user, profile]);

  const handleSaveContact = async () => {
    if (!user?.id) return;
    try {
      if (email !== user.email) {
        const { error } = await supabase.auth.updateUser({ email });
        if (error) throw error;
      }
      toast({ title: 'Success', description: 'Contact info updated.' });
      setSubView('main');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleSaveBirthday = async () => {
    if (!user?.id) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ birthday })
        .eq('id', user.id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Birthday updated.' });
      setSubView('main');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const formatBirthday = (dateStr: string | null) => {
    if (!dateStr) return 'Not set';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const handleSaveDisplayName = async () => {
    if (!user?.id) return;
    const errors = { firstName: !firstName.trim(), lastName: !lastName.trim() };
    setNameErrors(errors);
    if (errors.firstName || errors.lastName) {
      return;
    }
    try {
      const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: fullName })
        .eq('id', user.id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Name updated.' });
      setSubView('profile-detail');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleSaveUsername = async () => {
    if (!user?.id) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ username })
        .eq('id', user.id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Username updated.' });
      setSubView('profile-detail');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const usernameDialog = (
    <Dialog open={subView === 'username'} onOpenChange={(open) => !open && setSubView('profile-detail')}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <button onClick={() => setSubView('profile-detail')} className="hover:bg-accent rounded-full p-1 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            Username
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Changing your username will also change your Tone profile URL at tone.app/{username}.
        </p>

        <div className="border rounded-lg border-border/50 overflow-hidden">
          <div className="px-4 pt-3 pb-1">
            <Label className="text-xs text-muted-foreground">Username</Label>
            <div className="flex items-center gap-2">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="border-0 px-0 focus-visible:ring-0 shadow-none text-foreground flex-1"
              />
              {username && (
                <button onClick={() => setUsername('')} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <Button className="w-full" onClick={handleSaveUsername}>Done</Button>
      </DialogContent>
    </Dialog>
  );

  const displayNameDialog = (
    <Dialog open={subView === 'display-name'} onOpenChange={(open) => !open && setSubView('profile-detail')}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <button onClick={() => setSubView('profile-detail')} className="hover:bg-accent rounded-full p-1 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            Name
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-0 border rounded-lg border-border/50 overflow-hidden">
          <div className="px-4 pt-3 pb-1">
            <Label className="text-xs text-muted-foreground">First name</Label>
            <Input
              ref={firstNameRef}
              value={firstName}
              onChange={(e) => { setFirstName(e.target.value); setNameErrors(prev => ({ ...prev, firstName: false })); }}
              className={`border-0 px-0 shadow-none text-foreground ${nameErrors.firstName ? 'ring-2 ring-red-500 rounded focus-visible:outline-none' : 'focus-visible:ring-0'}`}
            />
          </div>
          <Separator />
          <div className="px-4 pt-3 pb-1">
            <Label className="text-xs text-muted-foreground">Middle name</Label>
            <Input value={middleName} onChange={(e) => setMiddleName(e.target.value)} placeholder="Middle name" className="border-0 px-0 focus-visible:ring-0 shadow-none text-foreground" />
          </div>
          <Separator />
          <div className="px-4 pt-3 pb-1">
            <Label className="text-xs text-muted-foreground">Last name</Label>
            <Input
              ref={lastNameRef}
              value={lastName}
              onChange={(e) => { setLastName(e.target.value); setNameErrors(prev => ({ ...prev, lastName: false })); }}
              className={`border-0 px-0 shadow-none text-foreground ${nameErrors.lastName ? 'ring-2 ring-red-500 rounded focus-visible:outline-none' : 'focus-visible:ring-0'}`}
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          If you change your name, you can't change it again for 60 days. Don't add any unusual capitalization, punctuation, characters or random words.{' '}
          <button className="text-primary hover:underline">Learn more</button>
        </p>

        <div>
          <h4 className="font-semibold text-foreground text-sm">Other names</h4>
          <p className="text-xs text-muted-foreground mt-1">Other names are always public and help people find you on Tone.</p>
        </div>

        <div className="border rounded-lg border-border/50 overflow-hidden">
          <button className="w-full flex items-center px-4 py-3 hover:bg-accent/50 transition-colors text-left">
            <span className="font-medium text-foreground text-sm">Manage other names</span>
          </button>
          <Separator />
          <button className="w-full flex items-center px-4 py-3 hover:bg-accent/50 transition-colors text-left">
            <span className="font-medium text-foreground text-sm">Manage language-specific names</span>
          </button>
        </div>

        <Button className="w-full" onClick={handleSaveDisplayName}>Review change</Button>
      </DialogContent>
    </Dialog>
  );

  const profileDetailDialog = (
    <Dialog open={subView === 'profile-detail'} onOpenChange={(open) => !open && setSubView('main')}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Profile details</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-2 py-4">
          <Avatar className="w-24 h-24">
            <AvatarImage src={profile?.profile_pic || ''} />
            <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
              {profile?.display_name?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
          <p className="text-lg font-semibold text-foreground">{profile?.display_name || 'User'}</p>
          <p className="text-sm text-muted-foreground">Tone</p>
        </div>

        <div className="border rounded-lg border-border/50 overflow-hidden">
          {[
            { label: 'Display name' },
            { label: 'Username' },
            { label: 'Profile picture' },
            { label: 'Bio' },
          ].map((item, idx, arr) => (
            <React.Fragment key={item.label}>
              <button
                onClick={() => {
                  if (item.label === 'Display name') setSubView('display-name');
                  else if (item.label === 'Username') setSubView('username');
                }}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors text-left"
              >
                <span className="font-medium text-foreground text-sm">{item.label}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
              {idx < arr.length - 1 && <Separator />}
            </React.Fragment>
          ))}
        </div>

        <div className="bg-muted/30 rounded-lg p-3">
          <p className="font-medium text-foreground text-sm">Profile changes apply to this app only</p>
          <p className="text-xs text-muted-foreground mt-1">
            Your display name and username are unique to this platform. You can update them at any time from your profile settings.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );

  const contactInfoDialog = (
    <Dialog open={subView === 'contact'} onOpenChange={(open) => !open && setSubView('main')}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Contact information</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Manage your email addresses and phone numbers, and control who can see your contact info. Use any of them to access your profiles or devices in this app.
        </p>

        <div className="border rounded-lg border-border/50 overflow-hidden">
          {/* Email row */}
          <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
            <span className="font-medium text-foreground text-sm flex-1 truncate">{email || 'No email set'}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>

          <Separator />

          {/* Phone row */}
          <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            <span className="font-medium text-foreground text-sm flex-1 truncate">{phone || 'Add phone number'}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        </div>

        <button className="text-sm font-medium text-primary hover:underline flex items-center gap-1 px-1">
          <Plus className="w-4 h-4" />
          Add new contact
        </button>
      </DialogContent>
    </Dialog>
  );

  const [editingBirthday, setEditingBirthday] = useState(false);

  const birthdayDialog = (
    <Dialog open={subView === 'birthday'} onOpenChange={(open) => !open && setSubView('main')}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Birthday</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Providing your birthday helps make sure you get the right experience for your age.
        </p>

        <div className="border rounded-lg border-border/50 overflow-hidden">
          {/* Birthday row */}
          <div className="flex items-center justify-between px-4 py-3">
            {editingBirthday ? (
              <div className="flex items-center gap-2 flex-1">
                <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className="flex-1" />
                <Button size="sm" onClick={() => { handleSaveBirthday(); setEditingBirthday(false); }}>Save</Button>
              </div>
            ) : (
              <>
                <span className="font-medium text-foreground text-sm">{formatBirthday(birthday || null)}</span>
                <Button variant="outline" size="sm" onClick={() => setEditingBirthday(true)}>Edit</Button>
              </>
            )}
          </div>

          <Separator />

          {/* Profile row */}
          <div className="flex items-center gap-3 px-4 py-3">
            <Avatar className="w-9 h-9">
              <AvatarImage src={profile?.profile_pic || ''} />
              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                {profile?.display_name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-foreground text-sm">{profile?.display_name || 'User'}</p>
              <p className="text-xs text-muted-foreground">Tone</p>
            </div>
          </div>
        </div>

        <button className="text-sm font-medium text-primary hover:underline px-1 text-left">
          Who can see your birthday on Tone
        </button>
      </DialogContent>
    </Dialog>
  );

  return (
    <>
    {usernameDialog}
    {displayNameDialog}
    {profileDetailDialog}
    {contactInfoDialog}
    {birthdayDialog}
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-foreground mb-2">Profiles and personal details</h2>
        <p className="text-muted-foreground">
          Review the profiles and personal details you've added to this account. Add more profiles by adding your accounts.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-foreground">Profiles</h3>
        <Card className="border-border/50 overflow-hidden">
          <CardContent className="p-0">
            <button
              onClick={() => setSubView('profile-detail')}
              className="w-full flex items-center justify-between px-4 py-4 hover:bg-accent/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={profile?.profile_pic || ''} />
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {profile?.display_name?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-foreground">{profile?.display_name || 'User'}</p>
                  <p className="text-sm text-muted-foreground">Tone</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            <Separator />
            <div className="px-4 py-3">
              <button className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
                <Plus className="w-4 h-4" />
                Add accounts
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-foreground">Personal details</h3>
        <Card className="border-border/50 overflow-hidden">
          <CardContent className="p-0">
            <button
              onClick={() => setSubView('contact')}
              className="w-full flex items-center justify-between px-4 py-4 hover:bg-accent/50 transition-colors text-left"
            >
              <div>
                <p className="font-medium text-foreground">Contact info</p>
                <p className="text-sm text-muted-foreground">{user?.email || 'No email set'}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            <Separator />
            <button
              onClick={() => setSubView('birthday')}
              className="w-full flex items-center justify-between px-4 py-4 hover:bg-accent/50 transition-colors text-left"
            >
              <div>
                <p className="font-medium text-foreground">Birthday</p>
                <p className="text-sm text-muted-foreground">{formatBirthday(profile?.birthday || null)}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
    </>
  );
};

export default ProfilesAndPersonalDetails;
