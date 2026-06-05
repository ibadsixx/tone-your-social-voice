import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { 
  Download, 
  Eye, 
  Search, 
  Users, 
  UserPlus,
  FileDown,
  Clock,
  Globe,
  Shield,
  Database,
  Loader2,
  CheckCircle2,
  XCircle,
  Archive
} from 'lucide-react';
import YourActivity from './YourActivity';

/**
 * Menu options for the Your Information and Permissions section
 */
type MenuOption = {
  id: string;
  title: string;
  icon: React.ElementType;
};

type ExportRequest = {
  id: string;
  data_type: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  download_url: string | null;
  completed_at: string | null;
  created_at: string;
};

/**
 * Your Information and Permissions Component
 * 
 * Features:
 * - Left-side menu with navigation options
 * - Right-side content that updates based on selected menu option
 * - State management using React hooks
 * - Responsive design with TailwindCSS
 */
const YourInformationAndPermissions: React.FC = () => {
  const { toast } = useToast();
  const [requesting, setRequesting] = useState(false);

  // State to track the currently selected menu option
  const [selectedOption, setSelectedOption] = useState<string>('export');

  // Menu options configuration
  const menuOptions: MenuOption[] = [
    { id: 'export', title: 'Export your information', icon: Download },
    { id: 'access', title: 'Access your information', icon: Eye },
    { id: 'search', title: 'Search history', icon: Search },
    { id: 'activity', title: 'Your activity', icon: Clock },
    { id: 'partners', title: 'Specific ad partners', icon: Users },
    { id: 'contacts', title: 'Manage contacts', icon: UserPlus }
  ];

  /**
   * Renders the content for the right side based on the selected menu option
   */
  const [dataType, setDataType] = useState<string>('');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const handleRequestExport = async () => {
    if (!dataType) return;
    setRequesting(true);
    try {
      const { data, error } = await supabase.rpc('create_export_request', {
        p_data_type: dataType,
        p_start_date: startDate ? format(startDate, 'yyyy-MM-dd') : null,
        p_end_date: endDate ? format(endDate, 'yyyy-MM-dd') : null,
      });
      if (error) throw error;
      toast({ title: 'Export requested', description: 'Your data export is being prepared. You will be notified when it is ready.' });
      setDataType('');
      setStartDate(undefined);
      setEndDate(undefined);
      fetchExportRequests();
    } catch (error) {
      console.error('Error requesting export:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to request export',
        variant: 'destructive',
      });
    } finally {
      setRequesting(false);
    }
  };

  const [exportRequests, setExportRequests] = useState<ExportRequest[]>([]);
  const [fetchingRequests, setFetchingRequests] = useState(false);

  const fetchExportRequests = async () => {
    setFetchingRequests(true);
    try {
      const { data, error } = await supabase.rpc('get_my_export_requests');
      if (error) throw error;
      setExportRequests(data || []);
    } catch (error) {
      console.error('Error fetching export requests:', error);
    } finally {
      setFetchingRequests(false);
    }
  };

  useEffect(() => {
    fetchExportRequests();
  }, []);

  const dataTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      posts: 'Posts',
      messages: 'Messages',
      profile: 'Profile Information',
      activity: 'Activity Log',
      media: 'Photos and Media',
      all: 'All Data',
    };
    return labels[type] || type;
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400"><CheckCircle2 className="w-3 h-3" />Ready</span>;
      case 'failed':
        return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400"><XCircle className="w-3 h-3" />Failed</span>;
      case 'processing':
        return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400"><Loader2 className="w-3 h-3 animate-spin" />Processing</span>;
      default:
        return <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><Clock className="w-3 h-3" />Pending</span>;
    }
  };

  const renderRightContent = () => {
    switch (selectedOption) {
      case 'export':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-foreground mb-2">Export Your Information</h2>
              <p className="text-muted-foreground">
                Download a copy of your information from Tone. This includes your profile data, posts, messages, and activity history.
              </p>
            </div>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileDown className="w-5 h-5" />
                  Data Export Options
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="data-type">Data type</Label>
                  <Select value={dataType} onValueChange={setDataType}>
                    <SelectTrigger id="data-type">
                      <SelectValue placeholder="Select the type of data to export" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="posts">Posts</SelectItem>
                      <SelectItem value="messages">Messages</SelectItem>
                      <SelectItem value="profile">Profile Information</SelectItem>
                      <SelectItem value="activity">Activity Log</SelectItem>
                      <SelectItem value="media">Photos and Media</SelectItem>
                      <SelectItem value="all">All Data</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !startDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate ? format(startDate, "PPP") : "Select start date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={setStartDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label>End date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !endDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDate ? format(endDate, "PPP") : "Select end date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          onSelect={setEndDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <Button className="w-full" disabled={!dataType || requesting} onClick={handleRequestExport}>
                  {requesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Request Export
                </Button>
              </CardContent>
            </Card>

            {exportRequests.length > 0 && (
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Archive className="w-5 h-5" />
                    Previously Requested Exports
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {fetchingRequests && exportRequests.length === 0 ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    exportRequests.map((req) => (
                      <div key={req.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{dataTypeLabel(req.data_type)}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(req.created_at), 'MMM d, yyyy')}
                            </span>
                            {statusBadge(req.status)}
                          </div>
                        </div>
                        {req.status === 'ready' && req.download_url && (
                          <a
                            href={req.download_url}
                            download
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0 ml-3"
                          >
                            <Download className="w-4 h-4" />
                            Download
                          </a>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="border-border/50 bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
              <CardContent className="p-4">
                <div className="flex items-start space-x-3">
                  <Clock className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-800 dark:text-blue-200">Export Timeline</p>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      Data exports typically take 24-48 hours to prepare. You'll receive an email when your download is ready.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'access':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-foreground mb-2">Access Your Information</h2>
              <p className="text-muted-foreground">
                View and manage the information associated with your Tone account.
              </p>
            </div>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  Your Data Categories
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                    <h3 className="font-medium mb-2">Profile Information</h3>
                    <p className="text-sm text-muted-foreground mb-3">Your name, bio, profile picture, and account details</p>
                    <div className="text-xs text-muted-foreground">Last updated: 2 days ago</div>
                  </div>
                  
                  <div className="p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                    <h3 className="font-medium mb-2">Posts & Content</h3>
                    <p className="text-sm text-muted-foreground mb-3">All your posts, comments, and shared content</p>
                    <div className="text-xs text-muted-foreground">Last updated: 1 hour ago</div>
                  </div>
                  
                  <div className="p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                    <h3 className="font-medium mb-2">Messages</h3>
                    <p className="text-sm text-muted-foreground mb-3">Your private messages and conversations</p>
                    <div className="text-xs text-muted-foreground">Last updated: 30 minutes ago</div>
                  </div>
                  
                  <div className="p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                    <h3 className="font-medium mb-2">Activity Log</h3>
                    <p className="text-sm text-muted-foreground mb-3">Your likes, shares, and interactions</p>
                    <div className="text-xs text-muted-foreground">Last updated: 5 minutes ago</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'search':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-foreground mb-2">Search History</h2>
              <p className="text-muted-foreground">
                Review and manage your search history on Tone.
              </p>
            </div>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  Recent Searches
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">"photography tips"</p>
                      <p className="text-xs text-muted-foreground">2 hours ago</p>
                    </div>
                    <Button variant="ghost" size="sm">Remove</Button>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">"travel destinations"</p>
                      <p className="text-xs text-muted-foreground">1 day ago</p>
                    </div>
                    <Button variant="ghost" size="sm">Remove</Button>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">"@john_doe"</p>
                      <p className="text-xs text-muted-foreground">3 days ago</p>
                    </div>
                    <Button variant="ghost" size="sm">Remove</Button>
                  </div>
                </div>
                
                <div className="pt-4 border-t">
                  <Button variant="outline" className="w-full">
                    Clear All Search History
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle>Search Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Save Search History</p>
                      <p className="text-sm text-muted-foreground">Allow Tone to save your searches</p>
                    </div>
                    <Button variant="outline" size="sm">Enabled</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'partners':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-foreground mb-2">Specific Ad Partners</h2>
              <p className="text-muted-foreground">
                Manage which advertising partners can show you personalized ads.
              </p>
            </div>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Active Ad Partners
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                        <Globe className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-medium">Global Ads Network</p>
                        <p className="text-sm text-muted-foreground">Personalized ads based on your interests</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">Manage</Button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                        <Shield className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-medium">Privacy-First Ads</p>
                        <p className="text-sm text-muted-foreground">Non-tracking advertisement service</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">Manage</Button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                        <Users className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-medium">Social Commerce</p>
                        <p className="text-sm text-muted-foreground">Ads from brands you follow</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">Manage</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle>Partner Preferences</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Button variant="outline" className="w-full">
                    View All Ad Partners
                  </Button>
                  <Button variant="outline" className="w-full">
                    Opt Out of All Personalized Ads
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'activity':
        return <YourActivity />;

      case 'contacts':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-foreground mb-2">Manage Contacts</h2>
              <p className="text-muted-foreground">
                Control how Tone uses your contacts and manages your connections.
              </p>
            </div>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5" />
                  Contact Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">Contact Upload</p>
                      <p className="text-sm text-muted-foreground">Allow Tone to access your device contacts</p>
                    </div>
                    <Button variant="outline" size="sm">Disabled</Button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">Friend Suggestions</p>
                      <p className="text-sm text-muted-foreground">Get suggestions based on mutual connections</p>
                    </div>
                    <Button variant="outline" size="sm">Enabled</Button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">Contact Sync</p>
                      <p className="text-sm text-muted-foreground">Sync contacts across your devices</p>
                    </div>
                    <Button variant="outline" size="sm">Enabled</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle>Uploaded Contacts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <UserPlus className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">No contacts have been uploaded</p>
                  <Button variant="outline">Upload Contacts</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle>Contact Management</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button variant="outline" className="w-full">
                    Download Contact Data
                  </Button>
                  <Button variant="outline" className="w-full text-destructive">
                    Delete All Uploaded Contacts
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Select an option from the menu</p>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-foreground mb-2">Your Information and Permissions</h2>
        <p className="text-muted-foreground">Control how your data is used and manage your privacy settings.</p>
      </div>

      {/* Main content with left menu and right content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Menu */}
        <div className="lg:col-span-1">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Options</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <nav className="space-y-1">
                {menuOptions.map((option) => {
                  const Icon = option.icon;
                  const isActive = selectedOption === option.id;
                  
                  return (
                    <button
                      key={option.id}
                      onClick={() => setSelectedOption(option.id)}
                      className={`w-full flex items-center space-x-3 px-4 py-3 text-left text-sm font-medium transition-all duration-200 rounded-none first:rounded-t-none last:rounded-b-lg ${
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{option.title}</span>
                    </button>
                  );
                })}
              </nav>
            </CardContent>
          </Card>
        </div>

        {/* Right Content */}
        <div className="lg:col-span-3">
          <div className="transition-all duration-300 ease-in-out">
            {renderRightContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default YourInformationAndPermissions;