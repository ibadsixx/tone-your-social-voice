import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Auth = () => {
  const { user, signIn, signUp, loading, mfaRequired, completeMfa } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState('');
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || '/';

  // Show loading while checking auth state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  // Redirect if already authenticated
  if (user) {
    return <Navigate to={from} replace />;
  }

  const handleMfaSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMfaLoading(true);
    setMfaError('');
    const { error } = await completeMfa(mfaCode);
    setMfaLoading(false);
    if (error) {
      setMfaError(error.message || 'Invalid code. Please try again.');
    }
  };

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    
    await signIn(email, password);
    setIsLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const username = formData.get('username') as string;
    const displayName = formData.get('displayName') as string;
    
    await signUp(email, password, username, displayName);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-tone-gradient-hero flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-tone-glow">
        <CardHeader className="text-center">
          <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center mx-auto mb-4">
            <span className="text-tone-purple font-bold text-xl">T</span>
          </div>
          <CardTitle className="text-2xl font-bold">Welcome to Tone</CardTitle>
          <CardDescription>Share your thoughts with the perfect tone and connect with friends</CardDescription>
        </CardHeader>
        <CardContent>
          {mfaRequired ? (
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <div className="text-center mb-2">
                <p className="font-medium">Two-Factor Authentication</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Enter the 6-digit code from your authenticator app to continue.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mfa-code">Authentication Code</Label>
                <Input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  className="font-mono text-center text-lg tracking-widest"
                  required
                />
              </div>
              {mfaError && (
                <p className="text-sm text-red-500">{mfaError}</p>
              )}
              <Button type="submit" className="w-full" disabled={mfaLoading || mfaCode.length !== 6}>
                {mfaLoading ? 'Verifying...' : 'Verify & Sign In'}
              </Button>
            </form>
          ) : (
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>
              
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      name="email"
                      type="email"
                      placeholder="Enter your email"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <Input
                      id="signin-password"
                      name="password"
                      type="password"
                      placeholder="Enter your password"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Signing in...' : 'Sign In'}
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      name="email"
                      type="email"
                      placeholder="Enter your email"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-username">Username</Label>
                    <Input
                      id="signup-username"
                      name="username"
                      type="text"
                      placeholder="Choose a username"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-displayName">Display Name</Label>
                    <Input
                      id="signup-displayName"
                      name="displayName"
                      type="text"
                      placeholder="Enter your display name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      name="password"
                      type="password"
                      placeholder="Create a password"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Creating account...' : 'Sign Up'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;