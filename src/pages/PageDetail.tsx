import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Camera, Loader2, Save, Users } from 'lucide-react';

const categories = [
  'Business', 'Entertainment', 'Education', 'Sports', 'Technology',
  'Travel', 'Food & Cooking', 'Fashion', 'Health & Fitness', 'Art & Culture',
  'Music', 'Gaming', 'News & Media', 'Non-profit', 'Community', 'Other'
];

interface PageRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  cover_image: string | null;
  admin_id: string;
  created_at: string;
}

const PageDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [page, setPage] = useState<PageRow | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('');

  const isAdmin = !!user && page?.admin_id === user.id;

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('pages')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) {
        toast({ title: 'Error', description: 'Page not found', variant: 'destructive' });
        navigate('/pages');
        return;
      }
      setPage(data as PageRow);
      setName(data.name);
      setDescription(data.description ?? '');
      setCategory(data.category ?? '');

      const { count } = await supabase
        .from('page_followers')
        .select('*', { count: 'exact', head: true })
        .eq('page_id', id);
      setFollowerCount(count ?? 0);
      setLoading(false);
    })();
  }, [id, navigate, toast]);

  const handleSave = async () => {
    if (!page || !isAdmin) return;
    if (!name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('pages')
      .update({
        name: name.trim(),
        description: description.trim() || null,
        category: category || null,
      })
      .eq('id', page.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setPage({ ...page, name: name.trim(), description: description.trim() || null, category: category || null });
    toast({ title: 'Saved', description: 'Page updated successfully' });
  };

  const handleCoverUpload = async (file: File) => {
    if (!page || !isAdmin) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 5MB', variant: 'destructive' });
      return;
    }
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${page.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('covers')
      .upload(path, file, { upsert: true });
    if (uploadError) {
      setUploading(false);
      toast({ title: 'Upload failed', description: uploadError.message, variant: 'destructive' });
      return;
    }
    const { data: urlData } = supabase.storage.from('covers').getPublicUrl(path);
    const cover_image = urlData.publicUrl;
    const { error } = await supabase.from('pages').update({ cover_image }).eq('id', page.id);
    setUploading(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setPage({ ...page, cover_image });
    toast({ title: 'Cover updated' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!page) return null;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/pages')}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Pages
      </Button>

      {/* Cover */}
      <Card className="overflow-hidden">
        <div className="relative h-48 bg-gradient-to-br from-primary/20 to-purple-500/20">
          {page.cover_image && (
            <img src={page.cover_image} alt={page.name} className="w-full h-full object-cover" />
          )}
          {isAdmin && (
            <Button
              size="sm"
              variant="secondary"
              className="absolute bottom-3 right-3"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
              {uploading ? 'Uploading...' : 'Change cover'}
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleCoverUpload(f);
              e.target.value = '';
            }}
          />
        </div>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16 -mt-12 border-4 border-background">
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                {page.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-foreground truncate">{page.name}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" /> {followerCount} followers
                </span>
                {page.category && <Badge variant="secondary">{page.category}</Badge>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Manage page</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="page-name">Name</Label>
              <Input id="page-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="page-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="page-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="page-description">Description</Label>
              <Textarea
                id="page-description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving || !name.trim()}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save changes
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">
              {page.description || 'No description provided.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PageDetail;