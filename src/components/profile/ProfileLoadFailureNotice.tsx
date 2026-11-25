import { Button } from '@/components/ui/button';
import PageContainer from '@/components/PageContainer';
import type { ProfileLoadFailure } from '@/lib/profileLoadFailure';

interface Props {
  failure: ProfileLoadFailure;
  onRetry: () => void;
}

/**
 * A profile request that failed for a reason other than "no such profile".
 * Rendering an in-place, generic notice keeps a routing/auth/query failure out
 * of the not-found page without revealing whether a private profile exists.
 */
const ProfileLoadFailureNotice = ({ failure, onRetry }: Props) => (
  <PageContainer size="md">
    <div data-testid="profile-load-error" role="alert" className="space-y-3 text-center">
      <p className="text-muted-foreground">{failure.message}</p>
      <Button variant="outline" onClick={onRetry}>Try again</Button>
    </div>
  </PageContainer>
);

export default ProfileLoadFailureNotice;
