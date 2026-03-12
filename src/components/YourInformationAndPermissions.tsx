import React, { useState, useEffect } from 'react';
import { ChevronRight, ArrowLeft, Instagram, Facebook, Bell, FileText, Calendar, File, Maximize2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import YourActivity from './YourActivity';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';

type SubView = null | 'download' | 'view-data' | 'search-history' | 'activity-outside' | 'app-connections' | 'manage-contacts' | 'identity-verification';

const YourInformationAndPermissions: React.FC = () => {
  const [subView, setSubView] = useState<SubView>(null);
  const [showChooseProfile, setShowChooseProfile] = useState(false);
  const [showExportDestination, setShowExportDestination] = useState(false);
  const [showConfirmExport, setShowConfirmExport] = useState(false);
  const [showNotifyEmail, setShowNotifyEmail] = useState(false);
  const [showTailorInfo, setShowTailorInfo] = useState(false);
  const [exportCategories, setExportCategories] = useState<Record<string, boolean>>({});
  const { profile } = useProfile();
  const { user } = useAuth();

  const toneActivityItems = [
    { key: 'saved_items', label: 'Bookmarked items and collections' },
    { key: 'voting', label: 'Voting' },
    { key: 'messages', label: 'Conversations', subtitle: 'May require additional time to export' },
    { key: 'posts', label: 'Publications', subtitle: 'May require additional time to export' },
    { key: 'pages', label: 'Pages' },
    { key: 'polls', label: 'Surveys' },
    { key: 'events', label: 'Occasions' },
    { key: 'gaming', label: 'Tone Gaming' },
    { key: 'places', label: 'Your Locations' },
    { key: 'payments', label: 'Tone payments' },
    { key: 'marketplace', label: 'Tone Marketplace' },
    { key: 'comments_reactions', label: 'Remarks and reactions', subtitle: 'May require additional time to export' },
    { key: 'stories', label: 'Stories' },
    { key: 'bug_bounty', label: 'Bug Bounty' },
    { key: 'reels', label: 'Reels' },
    { key: 'fundraisers', label: 'Charitable drives' },
    { key: 'groups', label: 'Communities', subtitle: 'May require additional time to export' },
    { key: 'reviews', label: 'Appraisals' },
    { key: 'tone_spark', label: 'Tone Spark' },
    { key: 'navigation_bar', label: 'Navigation panel' },
    { key: 'shops', label: 'Storefronts' },
    { key: 'tagged_activity', label: 'Engagement you\'re identified in' },
    { key: 'tone_support', label: 'Tone assistance' },
    { key: 'live_videos', label: 'Live Broadcasts' },
    { key: 'ai', label: 'AI' },
    { key: 'other_activity', label: 'Miscellaneous engagement' },
  ];

  const personalInfoItems = [
    { key: 'tone_portal', label: 'Tone Portal' },
    { key: 'profile_information', label: 'Profile details' },
    { key: 'tone_assistant', label: 'Tone Assistant' },
    { key: 'health_professional', label: 'Health specialist' },
    { key: 'avatars_store', label: 'Avatars Gallery' },
    { key: 'tone_accounts_center', label: 'Tone Accounts Hub' },
    { key: 'other_personal_info', label: 'Additional personal details' },
  ];

  useEffect(() => {
    if (Object.keys(exportCategories).length === 0) {
      const initial: Record<string, boolean> = {};
      toneActivityItems.forEach(item => { initial[item.key] = true; });
      setExportCategories(initial);
    }
  }, []);

  const toggleCategory = (key: string) => {
    setExportCategories(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const clearAllCategories = () => {
    const cleared: Record<string, boolean> = {};
    toneActivityItems.forEach(item => { cleared[item.key] = false; });
    setExportCategories(cleared);
  };

  const topItems = [
    { id: 'download' as SubView, label: 'Download your data' },
    { id: 'view-data' as SubView, label: 'View your data' },
    { id: 'search-history' as SubView, label: 'Search history' },
  ];

  const middleItems = [
    { id: 'activity-outside' as SubView, label: 'Your activity outside Tone', icon: null },
    { id: 'app-connections' as SubView, label: 'App connections', icon: null },
    { id: 'manage-contacts' as SubView, label: 'Manage contacts', rightIcon: Instagram },
    { id: 'identity-verification' as SubView, label: 'Identity verification', rightIcon: Facebook },
  ];

  const renderListItem = (item: { id: SubView; label: string; icon?: any; rightIcon?: any }) => (
    <button
      key={item.id}
      onClick={() => setSubView(item.id)}
      className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-accent/50 transition-colors"
    >
      <span className="text-sm text-foreground">{item.label}</span>
      <div className="flex items-center gap-2">
        {item.rightIcon && <item.rightIcon className="w-4 h-4 text-muted-foreground" />}
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </button>
  );

  const renderSubViewContent = () => {
    switch (subView) {
      case 'download':
        return (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              You may transfer a duplicate of your details to an outside platform, or save it locally to your device. Accessible data encompasses content and details you've contributed, your engagement and data we gather.
            </p>
            <button
              onClick={() => setShowChooseProfile(true)}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
            >
              Generate export
            </button>
            <div className="border-b border-border">
              <div className="flex">
                <button className="flex-1 pb-2 text-sm font-semibold border-b-2 border-primary text-foreground">Present engagement</button>
                <button className="flex-1 pb-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Previous engagement</button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Your export won't encompass details that another individual contributed, such as someone else's photos where you're identified. <span className="text-primary cursor-pointer hover:underline">Discover more</span>
            </p>
          </div>
        );
      case 'view-data':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">View the information associated with your Tone account.</p>
            <div className="space-y-2">
              {['Profile information', 'Posts & content', 'Messages', 'Activity log'].map(item => (
                <button key={item} className="w-full flex items-center justify-between px-4 py-3 border border-border rounded-lg hover:bg-accent/50 transition-colors">
                  <span className="text-sm">{item}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        );
      case 'search-history':
        return (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Review and manage your search history across Tone. Only you can see what you've searched.{' '}
              <span className="text-primary cursor-pointer hover:underline">Learn how we process your information in our Privacy Policy.</span>
            </p>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Your accounts & profiles</h3>
              <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
                {profile ? (
                  <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-muted overflow-hidden">
                        {profile.profile_pic ? (
                          <img src={profile.profile_pic} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm font-semibold">
                            {profile.display_name?.[0] || '?'}
                          </div>
                        )}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-foreground">{profile.display_name || profile.username}</p>
                        <p className="text-xs text-muted-foreground">Tone</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                ) : (
                  <div className="px-4 py-3 text-sm text-muted-foreground">No accounts linked</div>
                )}
              </div>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors">
                <span className="text-sm text-foreground">Keep searches for</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">Default</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </button>
            </div>
            <button className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">
              Clear all searches
            </button>
          </div>
        );
      case 'activity-outside':
        return (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Your activity off Tone technologies includes information that businesses and organizations share with us about your interactions with them such as visiting their apps or websites.
            </p>
            <div className="border border-border rounded-lg overflow-hidden">
              <button className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-accent/50 transition-colors">
                <span className="text-sm text-foreground">Learn more about activity off Tone technologies</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">What you can do</h3>
              <p className="text-xs text-muted-foreground mb-3">You can control or disconnect the information businesses send to Tone.</p>
              <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
                <button className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-accent/50 transition-colors">
                  <span className="text-sm text-foreground">Recent activity</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
                <button className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-accent/50 transition-colors">
                  <span className="text-sm text-foreground">Disconnect specific activity</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
                <button className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-accent/50 transition-colors">
                  <span className="text-sm text-foreground">Clear previous activity</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
                <button className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-accent/50 transition-colors">
                  <span className="text-sm text-foreground">Manage future activity</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          </div>
        );
      case 'app-connections':
        return (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              App connections allow you to do things across Tone products and other businesses.
            </p>
            <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
              {[
                { name: 'Google Calendar', icon: '📅' },
                { name: 'Outlook.com Calendar', icon: '📆' },
                { name: 'Outlook.com Mail', icon: '📧' },
                { name: 'Gmail', icon: '✉️' },
              ].map((app) => (
                <div key={app.name} className="flex items-center justify-between px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{app.icon}</span>
                    <span className="text-sm text-foreground">{app.name}</span>
                  </div>
                  <button className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
                    Connect
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      case 'manage-contacts':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Control how Tone uses your contacts and manages your connections.</p>
          </div>
        );
      case 'identity-verification':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Verify your identity to access additional features on Tone.</p>
          </div>
        );
      default:
        return null;
    }
  };

  const getSubViewTitle = () => {
    const titles: Record<string, string> = {
      'download': 'Export your information',
      'view-data': 'View your data',
      'search-history': 'Search history',
      'activity-outside': 'Your activity outside Tone',
      'app-connections': 'App connections',
      'manage-contacts': 'Manage contacts',
      'identity-verification': 'Identity verification',
    };
    return subView ? titles[subView] : '';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-foreground mb-1">Your information and permissions</h2>
        <p className="text-sm text-muted-foreground">To download or transfer a copy of your data, go to Download your data.</p>
      </div>

      {/* Top group */}
      <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
        {topItems.map(renderListItem)}
      </div>

      {/* Middle group */}
      <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
        {middleItems.map(renderListItem)}
      </div>

      {/* Footer text */}
      <p className="text-xs text-muted-foreground">
        Manage what data Tone can use to personalize your experience.
      </p>

      {/* Sub-view dialog */}
      <Dialog open={subView !== null} onOpenChange={(open) => !open && setSubView(null)}>
        <DialogContent className="sm:max-w-[500px] p-0 gap-0">
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <button onClick={() => setSubView(null)} className="hover:bg-accent/50 rounded-full p-1 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold">{getSubViewTitle()}</h2>
          </div>
          <div className="p-4">
            {renderSubViewContent()}
          </div>
        </DialogContent>
      </Dialog>
      {/* Select a profile dialog */}
      <Dialog open={showChooseProfile} onOpenChange={setShowChooseProfile}>
        <DialogContent className="sm:max-w-[500px] p-0 gap-0">
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <button onClick={() => setShowChooseProfile(false)} className="hover:bg-accent/50 rounded-full p-1 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold flex-1">Select a profile</h2>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Pick a profile to transfer your details{' '}
                <span className="text-primary cursor-pointer hover:underline">Discover more</span>
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Profiles</h3>
              <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
                {profile ? (
                  <button
                    onClick={() => {
                      setShowChooseProfile(false);
                      setShowExportDestination(true);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-muted overflow-hidden">
                        {profile.profile_pic ? (
                          <img src={profile.profile_pic} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm font-semibold">
                            {profile.display_name?.[0] || '?'}
                          </div>
                        )}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-foreground">{profile.display_name || profile.username}</p>
                        <p className="text-xs text-muted-foreground">Tone</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                ) : (
                  <div className="px-4 py-3 text-sm text-muted-foreground">No profiles associated</div>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Supplementary Tone profile details can be transferred by navigating to Tone settings.
            </p>
          </div>
        </DialogContent>
      </Dialog>
      {/* Choose where to export dialog */}
      <Dialog open={showExportDestination} onOpenChange={setShowExportDestination}>
        <DialogContent className="sm:max-w-[500px] p-0 gap-0">
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <button
              onClick={() => {
                setShowExportDestination(false);
                setShowChooseProfile(true);
              }}
              className="hover:bg-accent/50 rounded-full p-1 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold flex-1">Pick an export destination</h2>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-sm text-muted-foreground font-medium">
                {profile?.display_name || profile?.username} • Tone
              </p>
              <h3 className="text-base font-semibold text-foreground mt-1">Select where to send your data</h3>
              <p className="text-sm text-muted-foreground mt-1">
                You may transfer your details to your device or to a third-party platform.{' '}
                <span className="text-primary cursor-pointer hover:underline">Discover more about storage needs</span>
              </p>
            </div>
            <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
              <button
                onClick={() => {
                  setShowExportDestination(false);
                  setShowConfirmExport(true);
                }}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-accent/50 transition-colors"
              >
                <span className="text-sm text-foreground">Save to device</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
              <button className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-accent/50 transition-colors">
                <span className="text-sm text-foreground">Transfer to external platform</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Confirm your export dialog */}
      <Dialog open={showConfirmExport} onOpenChange={setShowConfirmExport}>
        <DialogContent className="sm:max-w-[500px] p-0 gap-0 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <button
              onClick={() => {
                setShowConfirmExport(false);
                setShowExportDestination(true);
              }}
              className="hover:bg-accent/50 rounded-full p-1 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold flex-1">Verify your export</h2>
          </div>
          <div className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Once your export is prepared, we'll dispatch a notification. For safety purposes, you'll have a four-day window to retrieve your files.
            </p>

            {/* Profile card */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
                  {profile?.profile_pic ? (
                    <img src={profile.profile_pic} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm font-semibold">
                      {profile?.display_name?.[0] || '?'}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{profile?.display_name || profile?.username}</p>
                  <p className="text-xs text-muted-foreground">Tone</p>
                  <p className="text-xs text-muted-foreground">Export to Device · Once</p>
                </div>
              </div>
            </div>

            {/* Settings list */}
            <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
              <button
                onClick={() => setShowNotifyEmail(true)}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-muted-foreground" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">Alert</p>
                    <p className="text-xs text-muted-foreground">{user?.email || 'No email configured'}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => setShowTailorInfo(true)}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">Tailor information</p>
                    <p className="text-xs text-muted-foreground">All obtainable information excluding data logs</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
              <button className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-accent/50 transition-colors">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-muted-foreground" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">Date interval</p>
                    <p className="text-xs text-muted-foreground">Previous year</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
              <button className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-accent/50 transition-colors">
                <div className="flex items-center gap-3">
                  <File className="w-5 h-5 text-muted-foreground" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">File type</p>
                    <p className="text-xs text-muted-foreground">HTML</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
              <button className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-accent/50 transition-colors">
                <div className="flex items-center gap-3">
                  <Maximize2 className="w-5 h-5 text-muted-foreground" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">Media fidelity</p>
                    <p className="text-xs text-muted-foreground">Medium fidelity</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              To incorporate data logs in your export, choose this option when you tailor your information.{' '}
              <span className="text-primary cursor-pointer hover:underline">What are data logs?</span>
            </p>
            <p className="text-xs text-muted-foreground">
              This file may contain confidential information. You should keep it protected and exercise caution when exporting it.
            </p>

            <button className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">
              Initiate export
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Notify email dialog */}
      <Dialog open={showNotifyEmail} onOpenChange={setShowNotifyEmail}>
        <DialogContent className="sm:max-w-[500px] p-0 gap-0">
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <button
              onClick={() => {
                setShowNotifyEmail(false);
                setShowConfirmExport(true);
              }}
              className="hover:bg-accent/50 rounded-full p-1 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold flex-1">Inform</h2>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-sm text-muted-foreground font-medium">
                {profile?.display_name || profile?.username} • Tone
              </p>
              <h3 className="text-base font-semibold text-foreground mt-1">Notify</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Notifications regarding your data export will be dispatched to this email address.
              </p>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3.5">
                <span className="text-sm text-foreground">{user?.email || 'No email configured'}</span>
                <div className="w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setShowNotifyEmail(false);
                setShowConfirmExport(true);
              }}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
            >
              Preserve
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Tailor information dialog */}
      <Dialog open={showTailorInfo} onOpenChange={setShowTailorInfo}>
        <DialogContent className="sm:max-w-[500px] p-0 gap-0 max-h-[90vh] flex flex-col">
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <button
              onClick={() => {
                setShowTailorInfo(false);
                setShowConfirmExport(true);
              }}
              className="hover:bg-accent/50 rounded-full p-1 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold flex-1">Select precise data to export</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div>
              <p className="text-sm text-muted-foreground font-medium">
                {profile?.display_name || profile?.username} • Tone
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Your Tone engagement</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Details and engagement from various sections of Tone, such as publications you've authored, images you're identified in, communities you participate in and beyond
                </p>
              </div>
              <button
                onClick={clearAllCategories}
                className="text-xs text-primary hover:underline whitespace-nowrap ml-3"
              >
                Remove all
              </button>
            </div>
            <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
              {toneActivityItems.map(item => (
                <button
                  key={item.key}
                  onClick={() => toggleCategory(item.key)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="text-left">
                    <p className="text-sm text-foreground">{item.label}</p>
                    {item.subtitle && (
                      <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                    )}
                  </div>
                  <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border ${
                    exportCategories[item.key]
                      ? 'bg-primary border-primary'
                      : 'border-muted-foreground'
                  }`}>
                    {exportCategories[item.key] && (
                      <svg className="w-3 h-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="p-4 border-t border-border">
            <button
              onClick={() => {
                setShowTailorInfo(false);
                setShowConfirmExport(true);
              }}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
            >
              Preserve
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default YourInformationAndPermissions;
