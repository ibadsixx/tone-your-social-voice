import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  ChevronRight,
} from 'lucide-react';

interface PageStatusData {
  id: string;
  name: string;
  profile_pic?: string | null;
}

const PageStatus = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [page, setPage] = useState<PageStatusData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const state = location.state as PageStatusData | null;
    if (state?.id === id) {
      setPage(state);
      setLoading(false);
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from('pages')
        .select('id, name, profile_pic')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) {
        console.error('PageStatus: query failed', error);
        setPage({ id, name: 'Page', profile_pic: null });
        setLoading(false);
        return;
      }
      setPage(data);
      setLoading(false);
    })();
  }, [id, location.state]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!page) return null;

  const sections = [
    {
      icon: AlertTriangle,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
      title: 'Violations of community standards',
      description: 'No violations found on this page.',
      status: 'clean',
    },
    {
      icon: ShieldCheck,
      color: 'text-green-600',
      bgColor: 'bg-green-500/10',
      title: 'Account status',
      description: 'Your page is active and in good standing.',
      status: 'active',
    },
    {
      icon: Sparkles,
      color: 'text-purple-600',
      bgColor: 'bg-purple-500/10',
      title: 'Additional features',
      description: 'Explore tools to grow your page.',
      action: 'Learn more',
    },
    {
      icon: HelpCircle,
      color: 'text-blue-600',
      bgColor: 'bg-blue-500/10',
      title: 'Discover more',
      description: 'Tips and resources for page creators.',
      action: 'Explore',
    },
  ];

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/pages/${page.id}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={page.profile_pic || ''} />
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
            {page.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-xl font-bold">Page Quality</h1>
          <p className="text-sm text-muted-foreground">{page.name}</p>
        </div>
      </div>

      {sections.map((section) => (
        <Card key={section.title} className="hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className={`${section.bgColor} p-3 rounded-full shrink-0`}>
                <section.icon className={`h-5 w-5 ${section.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground">{section.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
              </div>
              {section.action ? (
                <Button variant="ghost" size="sm" className="shrink-0">
                  {section.action}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Badge
                  variant={section.status === 'clean' || section.status === 'active' ? 'secondary' : 'outline'}
                  className="shrink-0"
                >
                  <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />
                  {section.status === 'clean' ? 'No issues' : 'Active'}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default PageStatus;
