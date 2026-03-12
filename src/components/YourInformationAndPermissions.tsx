import React, { useState } from 'react';
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
  const { profile } = useProfile();
  const { user } = useAuth();

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
              <button className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-accent/50 transition-colors">
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
    </div>
  );
};

export default YourInformationAndPermissions;
