import { createContext, useContext, useEffect, useState } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';

interface GatewayUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  role?: string;
  email_confirmed_at?: boolean | string;
  factors?: { id?: string; status?: string; factor_type?: string }[];
}

interface GatewaySession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: string;
  user: GatewayUser;
}

interface AuthContextType {
  user: GatewayUser | null;
  session: GatewaySession | null;
  loading: boolean;
  mfaRequired: boolean;
  completeMfa: (code: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, username: string, displayName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<GatewayUser | null>(null);
  const [session, setSession] = useState<GatewaySession | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | undefined>(undefined);
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;
    let sessionResolved = false;

     // Safety: never block the UI indefinitely if auth init hangs (e.g., storage/network quirks)
     const loadingTimeout = window.setTimeout(() => {
       if (mounted && !sessionResolved) {
         console.warn('[Auth] Session check timed out; continuing without session');
         setLoading(false);
       }
     }, 4000);

    // Set up auth state listener first
    const { data: { subscription } } = gateway.auth.onAuthStateChange(
      (event, session) => {
        if (mounted) {
          sessionResolved = true;
          window.clearTimeout(loadingTimeout);
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
        }
      }
    );

    // Get initial session with error handling
    gateway.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (mounted) {
          sessionResolved = true;
          window.clearTimeout(loadingTimeout);
          if (error) {
            console.error('Failed to get session:', error);
            toast({
              title: "Connection error",
              description: "Failed to connect to authentication service. Please check your internet connection.",
              variant: "destructive"
            });
          }
          // Only update user if we actually got a session — avoids a slow
          // network response resetting user to null after a concurrent login
          if (session) {
            setSession(session);
            setUser(session.user);
          }
          setLoading(false);
        }
      })
      .catch((error) => {
        console.error('getSession exception:', error);
        if (mounted) {
          sessionResolved = true;
          window.clearTimeout(loadingTimeout);
          toast({
            title: "Failed to fetch",
            description: error.message || "Unable to connect to the server. Please try again.",
            variant: "destructive"
          });
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
      window.clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, [toast]);

  const signUp = async (email: string, password: string, username: string, displayName: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await gateway.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            username,
            display_name: displayName
          }
        }
      });

      if (error) {
        toast({
          title: "Sign up failed",
          description: error.message,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Check your email",
          description: "We've sent you a confirmation link to complete your registration."
        });
      }

      return { error };
    } catch (error: any) {
      toast({
        title: "Sign up failed",
        description: error.message,
        variant: "destructive"
      });
      return { error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const result = await gateway.auth.signInWithPassword({
        email,
        password,
      });

      if (result.error) {
        setMfaRequired(false);
        setMfaFactorId(undefined);
        toast({
          title: "Sign in failed",
          description: result.error.message,
          variant: "destructive"
        });
        return { error: result.error };
      }

      if (result.data?.mfaRequired) {
        setMfaRequired(true);
        setMfaFactorId(result.data.factorId);
        return { error: null };
      }

      setMfaRequired(false);
      setMfaFactorId(undefined);
      return { error: null };
    } catch (error: any) {
      setMfaRequired(false);
      setMfaFactorId(undefined);
      toast({
        title: "Sign in failed",
        description: error.message,
        variant: "destructive"
      });
      return { error };
    }
  };

  const completeMfa = async (code: string) => {
    try {
      if (!mfaFactorId) {
        return { error: { message: 'No pending two-factor login found' } };
      }

      const challenge = await gateway.auth.mfa.challenge({ factorId: mfaFactorId });
      if (challenge.error) {
        toast({
          title: "Verification failed",
          description: challenge.error.message,
          variant: "destructive"
        });
        return { error: challenge.error };
      }

      const verify = await gateway.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.data.id,
        code,
      });

      if (verify.error) {
        toast({
          title: "Verification failed",
          description: verify.error.message,
          variant: "destructive"
        });
        return { error: verify.error };
      }

      setMfaRequired(false);
      setMfaFactorId(undefined);
      return { error: null };
    } catch (error: any) {
      toast({
        title: "Verification failed",
        description: error.message,
        variant: "destructive"
      });
      return { error };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await gateway.auth.signOut();
      
      if (error) {
        toast({
          title: "Sign out failed",
          description: error.message,
          variant: "destructive"
        });
      }

      return { error };
    } catch (error: any) {
      toast({
        title: "Sign out failed",
        description: error.message,
        variant: "destructive"
      });
      return { error };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        mfaRequired,
        completeMfa,
        signUp,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};