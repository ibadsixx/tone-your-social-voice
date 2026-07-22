import { useEffect, useState } from 'react';
import { gateway } from '@/lib/gateway';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Database } from 'lucide-react';

const SupabaseTest = () => {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [userCount, setUserCount] = useState<number>(0);

  useEffect(() => {
    const testConnection = async () => {
      try {
        // Test basic connection by checking if we can query profiles table
        const { data, error } = await gateway
          .from('profiles')
          .select('id', { count: 'exact' })
          .limit(0);

        if (error) {
          console.error('Connection test failed:', error);
          setIsConnected(false);
        } else {
          setIsConnected(true);
          setUserCount(data?.length || 0);
        }
      } catch (err) {
        console.error('Connection test error:', err);
        setIsConnected(false);
      }
    };

    testConnection();
  }, []);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-tone-purple" />
          Supabase Connection
        </CardTitle>
        <CardDescription>Testing database connectivity</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Status:</span>
          {isConnected === null ? (
            <Badge variant="secondary">Testing...</Badge>
          ) : isConnected ? (
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
              <CheckCircle className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          ) : (
            <Badge variant="destructive">
              <XCircle className="h-3 w-3 mr-1" />
              Failed
            </Badge>
          )}
        </div>
        
        {isConnected && (
          <div className="text-xs text-muted-foreground">
            Successfully connected to Tonex database
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SupabaseTest;