import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { profilesApi } from '@/api';
import ProfileLoadFailureNotice from '@/components/profile/ProfileLoadFailureNotice';
import PageContainer from '@/components/PageContainer';
import {
  classifyProfileLoadFailure,
  describeProfileLoadFailure,
} from '@/lib/profileLoadFailure';
import type { ProfileLoadErrorLike, ProfileLoadFailure } from '@/lib/profileLoadFailure';
import { getCurrentAccessToken } from '@/lib/supabase/sessionTokenProvider';

// `/profile` is the signed-in user's own-profile shortcut. There is no id or
// username param here: identity comes only from the central Auth session.
//
// It used to run `.single()` directly against the dataClient and turn every
// failure into one generic message. `.single()` errors on an empty result, and
// registry/routing/auth failures were indistinguishable from a missing row.
const Profile = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [failure, setFailure] = useState<ProfileLoadFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);

  const fail = (error: ProfileLoadErrorLike | ProfileLoadFailure) => {
    const classified = 'kind' in error ? error : classifyProfileLoadFailure(error);
    console.warn(describeProfileLoadFailure(classified));
    setFailure(classified);
  };

  const resolve = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;
    setLoading(true);
    setFailure(null);

    try {
      if (!user?.id) {
        fail(classifyProfileLoadFailure({ code: 'NO_SESSION' }));
        return;
      }
      if (!(await getCurrentAccessToken())) {
        if (!isCurrent()) return;
        fail(classifyProfileLoadFailure({ code: 'NO_SESSION' }));
        return;
      }

      // maybeSingle keeps a missing row as `{ data: null, error: null }`, so
      // only the explicit ensureProfile step creates it.
      const { data, error: fetchError } = await profilesApi.getProfileById(user.id);
      if (!isCurrent()) return;
      if (fetchError) {
        fail(fetchError);
        return;
      }

      let username = data?.username;

      if (!username) {
        const created = await profilesApi.ensureProfile({
          id: user.id,
          email: user.email,
          user_metadata: user.user_metadata,
        });
        if (!isCurrent()) return;
        username = created?.username;
      }

      if (!username) {
        fail(classifyProfileLoadFailure({ code: 'MISSING_PROFILE_ROW' }));
        return;
      }

      navigate(`/profile/${username}`, { replace: true });
    } catch (caught) {
      if (!isCurrent()) return;
      const errorLike: ProfileLoadErrorLike =
        caught instanceof Error ? { message: caught.message } : { message: 'unknown error' };
      fail(errorLike);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [user, navigate]);

  useEffect(() => {
    void resolve();
  }, [resolve]);

  if (loading) {
    return (
      <PageContainer size="sm">
        <div className="text-center">Loading profile...</div>
      </PageContainer>
    );
  }
  if (failure) return <ProfileLoadFailureNotice failure={failure} onRetry={() => { void resolve(); }} />;
  return null;
};

export default Profile;
