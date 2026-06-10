-- Update determine_request_category to check for pending friend requests
-- and restricted users.
--
-- Categorization rules:
--   'you_may_know' — mutual friends OR pending friend request from sender
--   'spam'         — restricted/blocked users, or no connection at all

CREATE OR REPLACE FUNCTION public.determine_request_category(sender_id uuid, receiver_id uuid)
RETURNS message_request_category AS $$
    SELECT CASE
        WHEN EXISTS (
            SELECT 1 FROM public.restricted_users
            WHERE user_id = receiver_id AND restricted_user_id = sender_id
        ) THEN 'spam'::message_request_category
        WHEN public.get_mutual_friends_count(sender_id, receiver_id) > 0 THEN 'you_may_know'::message_request_category
        WHEN EXISTS (
            SELECT 1 FROM public.friends
            WHERE status = 'pending'
            AND requester_id = sender_id AND receiver_id = receiver_id
        ) THEN 'you_may_know'::message_request_category
        ELSE 'spam'::message_request_category
    END;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
