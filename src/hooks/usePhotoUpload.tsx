import { useState } from 'react';
import { gateway } from '@/lib/gateway';
import { postsApi } from '@/api';
import { useToast } from '@/hooks/use-toast';
import { POST_CREATED_EVENT } from '@/hooks/useHomeFeed';

interface UploadResponse {
  publicUrl: string;
  fileName: string;
}

export interface ProfileUpdatePostPayload {
  content: string;
  type: 'profile_picture_update' | 'cover_photo_update';
}

/**
 * Which part of a profile-picture / cover-photo change went wrong.
 *
 * The distinction is the whole point: an upload can succeed and the picture be
 * saved while the *announcement post* still fails, and those are different
 * outcomes for the user. Reporting both as "Failed to upload" told people their
 * photo had not saved when it had.
 */
export type PhotoStage = 'validation' | 'upload' | 'profile' | 'announcement';

export class PhotoUpdateError extends Error {
  readonly stage: PhotoStage;
  /** The underlying gateway/storage rejection, kept for logging (do.md §7). */
  readonly reason?: unknown;

  constructor(stage: PhotoStage, message: string, reason?: unknown) {
    super(message);
    this.name = 'PhotoUpdateError';
    this.stage = stage;
    this.reason = reason;
  }
}

/**
 * Ceiling for a single profile/cover image.
 *
 * The signed direct upload to Cloudinary has no size limit, but the gateway's
 * proxied multipart fallback runs on Vercel, which rejects a body over ~4.5MB
 * with a bare `413 FUNCTION_PAYLOAD_TOO_LARGE`. Past this point we would rather
 * say so in a sentence the user can act on than surface an opaque platform
 * error. 8MB is far more than a profile picture or cover needs — the cover
 * editor re-encodes to a 1920px JPEG before upload regardless.
 */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** Extensions accepted when the browser gives us no usable MIME type. */
const KNOWN_IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i;

/**
 * Reject a file before a single byte goes over the wire, with a message that
 * names the problem. Both branches used to fall through to the storage layer,
 * where an unsupported type or an oversized body surfaced as the same opaque
 * "Failed to upload" as a Cloudinary outage (do.md §14).
 */
export const validatePhotoFile = (file: File | Blob, label: string): void => {
  const name = (file as File).name || 'That file';
  const type = file.type || '';

  const looksLikeImage = type
    ? type.startsWith('image/')
    : KNOWN_IMAGE_EXT.test(name);

  if (!looksLikeImage) {
    throw new PhotoUpdateError(
      'validation',
      type
        ? `${name} is a ${type.replace(/\//g, ' ')} file, not an image.`
        : `${name} does not look like an image file.`
    );
  }

  if (file.size > MAX_PHOTO_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    const cap = (MAX_PHOTO_BYTES / (1024 * 1024)).toFixed(0);
    throw new PhotoUpdateError(
      'validation',
      `That ${label} image is ${mb}MB. Please choose one under ${cap}MB.`
    );
  }
};

/**
 * The message to show the user for a failed photo update.
 *
 * Messages we wrote ourselves — a rejected file type, an oversized image, the
 * platform's body cap, a profile write that did not land — are safe and
 * actionable, so they survive into production; a bare "Failed to upload" tells
 * the user nothing they can act on. Anything else is an unexpected internal
 * error, so its detail stays in the console and in the development toast rather
 * than in front of a user.
 */
export const photoErrorMessage = (
  error: unknown,
  label: 'profile picture' | 'cover photo'
): string => {
  if (error instanceof PhotoUpdateError) return error.message;
  if (import.meta.env.DEV) return describeStorageFailure(error, label);
  return 'Please try again.';
};

/** Extension for the storage path, from the file name or its MIME type. */
const extensionOf = (file: File | Blob, fallback = 'jpg'): string => {
  const fromName = (file as File).name?.split('.').pop();
  if (fromName && KNOWN_IMAGE_EXT.test(`.${fromName}`)) return fromName.toLowerCase();
  const subtype = file.type?.split('/')[1];
  if (subtype && /^[a-z0-9]+$/i.test(subtype)) return subtype.toLowerCase();
  return fallback;
};

/** Turn a gateway/storage rejection into something a user can act on. */
const describeStorageFailure = (reason: unknown, label: string): string => {
  const message =
    (reason as { message?: string } | null)?.message ||
    (typeof reason === 'string' ? reason : '') ||
    '';

  // The Vercel body cap answers with a bare platform string, no JSON body.
  if (/FUNCTION_PAYLOAD_TOO_LARGE|Request Entity Too Large/i.test(message)) {
    return `That ${label} image is too large to upload. Please choose a smaller file.`;
  }
  if (message) return `Could not upload the ${label} image: ${message}`;
  return `Could not upload the ${label} image.`;
};

/**
 * The one storage upload used by every profile/cover path.
 *
 * The bucket name is part of the path on purpose. The Cloudinary provider
 * ignores the bucket entirely — `public_id` is just the path — so two uploads
 * that landed in the same millisecond under the old
 * `<user>/<Date.now()>.<ext>` shape produced the *same* `public_id` and the
 * second silently overwrote the first, letting a cover photo replace a profile
 * picture. Including the bucket and a random suffix makes the two namespaces
 * disjoint, and matches the proven shape `useFileUpload` already uses for post
 * media.
 *
 * Returns the media URL; throws a `PhotoUpdateError` on failure. Callers must
 * treat a returned URL as "the file is in storage" — the profile row is a
 * separate, later step.
 */
export const uploadPhotoToStorage = async (
  file: File | Blob,
  bucket: 'avatars' | 'covers',
  userId: string,
  extension: string
): Promise<UploadResponse> => {
  const fileName = `${userId}/${bucket}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.${extension}`;

  const { error } = await gateway.storage
    .from(bucket)
    .upload(fileName, file, {
      contentType: file.type || `image/${extension}`,
      upsert: false,
    });

  if (import.meta.env.DEV) {
    console.debug('[usePhotoUpload] storage.upload result:', {
      bucket,
      fileName,
      hasError: !!error,
      error: error ? (error as any).message : undefined,
    });
  }

  if (error) {
    throw new PhotoUpdateError(
      'upload',
      describeStorageFailure(error, bucket === 'covers' ? 'cover' : 'profile'),
      error
    );
  }

  const { data } = gateway.storage.from(bucket).getPublicUrl(fileName);
  const publicUrl = data.publicUrl;
  if (import.meta.env.DEV) {
    console.debug('[usePhotoUpload] getPublicUrl:', { bucket, fileName, publicUrl });
  }
  return { publicUrl, fileName };
};

/**
 * Persist the media URL on the caller's own profile row.
 *
 * Runs only after the upload is confirmed, so the previous picture stays live
 * until there is a confirmed replacement (do.md §9/§10). Authorization is not
 * relaxed: the filter is the row's own `id`, so this can only ever write the
 * authenticated user's profile.
 */
export const saveProfileImage = async (
  userId: string,
  field: 'profile_pic' | 'cover_pic',
  imageUrl: string,
  extra?: Record<string, unknown>
): Promise<void> => {
  const { error } = await gateway
    .from('profiles')
    .update({ [field]: imageUrl, ...extra })
    .eq('id', userId);

  if (error) {
    throw new PhotoUpdateError(
      'profile',
      profileSaveMessage(error, label),
      error
    );
  }
};

// Data integrity rule (photo profile posts): the stored caption is ONLY the
// user's own text. The "changed their profile picture" / "updated their cover
// photo" phrase is rendered by Post.tsx in the POST HEADER next to the user's
// name — it must never be inserted into, appended to, or stored as part of the
// caption. Posting the update back is what lets the header text appear.
export const buildProfileUpdatePost = (
  type: 'profile' | 'cover',
  customText?: string
): ProfileUpdatePostPayload => ({
  content: (customText ?? '').trim(),
  type: type === 'profile' ? 'profile_picture_update' : 'cover_photo_update',
});

// Shared post-creation for automatic profile/cover-photo-change posts. Uses the
// SAME canonical creation path as the main composer (postsApi.createPost) so the
// announcement post behaves exactly like any other post. Inserted only with the
// user's actual caption (empty when none was entered) and the dedicated post
// type so Post.tsx renders "changed their profile picture" / "changed their
// cover photo" in the header — the phrase is never persisted into the caption.
// Throws on failure so callers can surface the error instead of silently
// losing the post.
export const createPhotoUpdatePost = async (
  userId: string,
  imageUrl: string,
  type: 'profile' | 'cover',
  customText?: string
): Promise<string> => {
  const payload = buildProfileUpdatePost(type, customText);

  const { data, error } = await postsApi.createPost({
    user_id: userId,
    content: payload.content,
    media_url: imageUrl,
    type: payload.type
  });

  if (error) throw new Error(error.message || 'Failed to create the automatic post');
  return data?.id ?? '';
};

export const usePhotoUpload = () => {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const uploadPhoto = async (
    file: File,
    type: 'profile' | 'cover',
    userId: string,
    customText?: string
  ) => {
    setUploading(true);

    const label = type === 'profile' ? 'profile picture' : 'cover photo';
    const capitalised = type === 'profile' ? 'Profile picture' : 'Cover photo';
    const bucket = type === 'profile' ? 'avatars' : 'covers';

    try {
      validatePhotoFile(file, label);

      const { publicUrl } = await uploadPhotoToStorage(
        file,
        bucket,
        userId,
        extensionOf(file)
      );

      // The picture is in storage and the row is about to be written. Anything
      // past this point is an announcement-post concern, not an upload one.
      //
      // A new cover starts from the top of the image. The cover editor already
      // reset the offset and the dialog-driven path did not, so the two ways of
      // changing a cover cropped it differently; one rule now, here.
      await saveProfileImage(
        userId,
        type === 'profile' ? 'profile_pic' : 'cover_pic',
        publicUrl,
        type === 'cover' ? { cover_position_y: 0 } : undefined
      );

      // The announcement post is a real row the feed reads back, so it is worth
      // reporting — but it is NOT part of whether the photo saved. Reporting its
      // failure as an upload failure is what told people their picture had not
      // been applied when it had.
      try {
        await createPhotoUpdatePost(userId, publicUrl, type, customText);
        window.dispatchEvent(new CustomEvent(POST_CREATED_EVENT));
        toast({
          title: 'Success',
          description: `${capitalised} updated and posted successfully`
        });
      } catch (postError) {
        console.error(
          `[usePhotoUpload] ${label} saved, but the announcement post failed:`,
          postError
        );
        toast({
          title: `${capitalised} updated`,
          description: `Your ${label} was saved, but the automatic post could not be created.`,
          variant: 'destructive'
        });
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('profile:updated', { detail: { userId, type, publicUrl } }));
      }

      return publicUrl;
    } catch (error) {
      // The real reason is always logged, and `photoErrorMessage` decides how
      // much of it the user sees (do.md §7).
      console.error(`[usePhotoUpload] ${label} update failed:`, error);

      toast({
        title: 'Error',
        description: photoErrorMessage(error, label),
        variant: 'destructive'
      });
      throw error;
    } finally {
      setUploading(false);
    }
  };

  return {
    uploadPhoto,
    uploading
  };
};
