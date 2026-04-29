export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      ad_activity: {
        Row: {
          advertiser: string
          clicked_at: string
          created_at: string
          id: string
          image_url: string | null
          title: string
          user_id: string
        }
        Insert: {
          advertiser: string
          clicked_at?: string
          created_at?: string
          id?: string
          image_url?: string | null
          title: string
          user_id: string
        }
        Update: {
          advertiser?: string
          clicked_at?: string
          created_at?: string
          id?: string
          image_url?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_advertisers: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          last_shown_at: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          last_shown_at?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          last_shown_at?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_advertisers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_associated_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_associated_categories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_profile_categories: {
        Row: {
          category_type: string
          created_at: string | null
          id: string
          is_used: boolean | null
          label: string
          user_id: string
        }
        Insert: {
          category_type: string
          created_at?: string | null
          id?: string
          is_used?: boolean | null
          label: string
          user_id: string
        }
        Update: {
          category_type?: string
          created_at?: string | null
          id?: string
          is_used?: boolean | null
          label?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_profile_categories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_settings: {
        Row: {
          created_at: string
          id: string
          show_ads_in_external_apps: boolean | null
          social_interactions_visibility: string | null
          updated_at: string
          use_activity_for_external_ads: boolean | null
          use_partner_data: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          show_ads_in_external_apps?: boolean | null
          social_interactions_visibility?: string | null
          updated_at?: string
          use_activity_for_external_ads?: boolean | null
          use_partner_data?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          show_ads_in_external_apps?: boolean | null
          social_interactions_visibility?: string | null
          updated_at?: string
          use_activity_for_external_ads?: boolean | null
          use_partner_data?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_topics: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
          preference: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          preference?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          preference?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_topics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audience_lists: {
        Row: {
          created_at: string | null
          id: string
          member_ids: string[]
          name: string
          owner_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          member_ids?: string[]
          name: string
          owner_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          member_ids?: string[]
          name?: string
          owner_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audience_lists_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_users: {
        Row: {
          blocked_user_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          blocked_user_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          blocked_user_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      blocks: {
        Row: {
          block_type: string
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          block_type?: string
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          block_type?: string
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      bug_reports: {
        Row: {
          context: string | null
          created_at: string
          description: string
          id: string
          screenshot_url: string | null
          user_id: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          description: string
          id?: string
          screenshot_url?: string | null
          user_id: string
        }
        Update: {
          context?: string | null
          created_at?: string
          description?: string
          id?: string
          screenshot_url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      call_history: {
        Row: {
          call_type: string
          caller_id: string
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          receiver_id: string
          started_at: string
          status: string
        }
        Insert: {
          call_type: string
          caller_id: string
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          receiver_id: string
          started_at?: string
          status: string
        }
        Update: {
          call_type?: string
          caller_id?: string
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          receiver_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_history_caller_id_fkey"
            columns: ["caller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_history_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      colleges: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      comment_reactions: {
        Row: {
          comment_id: string
          created_at: string | null
          emoji: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string | null
          emoji: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string | null
          emoji?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_shares: {
        Row: {
          comment_id: string
          created_at: string | null
          id: string
          shared_by: string
          shared_post_id: string | null
          shared_to: string | null
          type: string
        }
        Insert: {
          comment_id: string
          created_at?: string | null
          id?: string
          shared_by: string
          shared_post_id?: string | null
          shared_to?: string | null
          type: string
        }
        Update: {
          comment_id?: string
          created_at?: string | null
          id?: string
          shared_by?: string
          shared_post_id?: string | null
          shared_to?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_shares_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_shares_shared_post_id_fkey"
            columns: ["shared_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string
          id: string
          parent_comment_id: string | null
          post_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          post_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          post_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          name: string
          type: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          name: string
          type: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          name?: string
          type?: string
        }
        Relationships: []
      }
      content_preferences: {
        Row: {
          content_type: string
          created_at: string | null
          id: string
          owner_id: string
          preference: string
          user_id: string
          weight: number | null
        }
        Insert: {
          content_type: string
          created_at?: string | null
          id?: string
          owner_id: string
          preference: string
          user_id: string
          weight?: number | null
        }
        Update: {
          content_type?: string
          created_at?: string | null
          id?: string
          owner_id?: string
          preference?: string
          user_id?: string
          weight?: number | null
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_reports: {
        Row: {
          conversation_id: string
          created_at: string
          details: string | null
          id: string
          reason: string
          reported_user_id: string
          reporter_id: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reported_user_id: string
          reporter_id: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reported_user_id?: string
          reporter_id?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_reports_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_settings: {
        Row: {
          chat_theme: string
          conversation_id: string
          created_at: string
          id: string
          is_muted: boolean
          messaging_controls: Json | null
          quick_emoji: string | null
          read_receipts_enabled: boolean
          updated_at: string
          user_id: string
          vanishing_messages_duration: number | null
          vanishing_messages_enabled: boolean
        }
        Insert: {
          chat_theme?: string
          conversation_id: string
          created_at?: string
          id?: string
          is_muted?: boolean
          messaging_controls?: Json | null
          quick_emoji?: string | null
          read_receipts_enabled?: boolean
          updated_at?: string
          user_id: string
          vanishing_messages_duration?: number | null
          vanishing_messages_enabled?: boolean
        }
        Update: {
          chat_theme?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_muted?: boolean
          messaging_controls?: Json | null
          quick_emoji?: string | null
          read_receipts_enabled?: boolean
          updated_at?: string
          user_id?: string
          vanishing_messages_duration?: number | null
          vanishing_messages_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "conversation_settings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          chat_theme: string
          created_at: string
          created_by: string
          id: string
          quick_emoji: string | null
          type: string
          updated_at: string
        }
        Insert: {
          chat_theme?: string
          created_at?: string
          created_by: string
          id?: string
          quick_emoji?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          chat_theme?: string
          created_at?: string
          created_by?: string
          id?: string
          quick_emoji?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      editor_projects: {
        Row: {
          created_at: string
          id: string
          output_url: string | null
          owner_id: string
          project_json: Json
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          output_url?: string | null
          owner_id: string
          project_json?: Json
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          output_url?: string | null
          owner_id?: string
          project_json?: Json
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "editor_projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      encryption_verifications: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          status: string
          verified_at: string
          verified_by: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          status?: string
          verified_at?: string
          verified_by: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          status?: string
          verified_at?: string
          verified_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "encryption_verifications_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encryption_verifications_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_relationships: {
        Row: {
          created_at: string
          id: string
          member_id: string
          relation_type: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          relation_type: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          relation_type?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_relationships_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_relationships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      followers: {
        Row: {
          created_at: string | null
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string | null
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string | null
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "followers_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followers_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friends: {
        Row: {
          created_at: string
          id: string
          receiver_id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          receiver_id: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          receiver_id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friends_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friends_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          created_at: string | null
          id: string
          receiver_id: string
          sender_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          receiver_id: string
          sender_id: string
          status: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          receiver_id?: string
          sender_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "friendships_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_follows: {
        Row: {
          created_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_follows_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          created_at: string
          group_id: string
          role: Database["public"]["Enums"]["group_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          role?: Database["public"]["Enums"]["group_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          role?: Database["public"]["Enums"]["group_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_posts: {
        Row: {
          created_at: string
          group_id: string
          id: string
          message: string | null
          post_id: string
          shared_by: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          message?: string | null
          post_id: string
          shared_by: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          message?: string | null
          post_id?: string
          shared_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_posts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_posts_shared_by_fkey"
            columns: ["shared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          cover_image: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          invite_followers: boolean
          name: string
          privacy: string
        }
        Insert: {
          cover_image?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          invite_followers?: boolean
          name: string
          privacy?: string
        }
        Update: {
          cover_image?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          invite_followers?: boolean
          name?: string
          privacy?: string
        }
        Relationships: []
      }
      hashtag_follows: {
        Row: {
          created_at: string | null
          hashtag_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          hashtag_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          hashtag_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hashtag_follows_hashtag_id_fkey"
            columns: ["hashtag_id"]
            isOneToOne: false
            referencedRelation: "hashtag_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hashtag_follows_hashtag_id_fkey"
            columns: ["hashtag_id"]
            isOneToOne: false
            referencedRelation: "hashtags"
            referencedColumns: ["id"]
          },
        ]
      }
      hashtag_links: {
        Row: {
          created_at: string | null
          hashtag_id: string
          id: string
          source_id: string
          source_type: string
        }
        Insert: {
          created_at?: string | null
          hashtag_id: string
          id?: string
          source_id: string
          source_type: string
        }
        Update: {
          created_at?: string | null
          hashtag_id?: string
          id?: string
          source_id?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "hashtag_links_hashtag_id_fkey"
            columns: ["hashtag_id"]
            isOneToOne: false
            referencedRelation: "hashtag_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hashtag_links_hashtag_id_fkey"
            columns: ["hashtag_id"]
            isOneToOne: false
            referencedRelation: "hashtags"
            referencedColumns: ["id"]
          },
        ]
      }
      hashtags: {
        Row: {
          created_at: string | null
          follower_count: number | null
          id: string
          tag: string
        }
        Insert: {
          created_at?: string | null
          follower_count?: number | null
          id?: string
          tag: string
        }
        Update: {
          created_at?: string | null
          follower_count?: number | null
          id?: string
          tag?: string
        }
        Relationships: []
      }
      hidden_content: {
        Row: {
          content_id: string | null
          content_type: Database["public"]["Enums"]["content_type"] | null
          created_at: string
          id: string
          profile_id: string | null
          user_id: string
        }
        Insert: {
          content_id?: string | null
          content_type?: Database["public"]["Enums"]["content_type"] | null
          created_at?: string
          id?: string
          profile_id?: string | null
          user_id: string
        }
        Update: {
          content_id?: string | null
          content_type?: Database["public"]["Enums"]["content_type"] | null
          created_at?: string
          id?: string
          profile_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      high_schools: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      life_events: {
        Row: {
          category: string
          created_at: string
          extra_info: string | null
          id: string
          title: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          category: string
          created_at?: string
          extra_info?: string | null
          id?: string
          title: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          category?: string
          created_at?: string
          extra_info?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lives: {
        Row: {
          ended_at: string | null
          id: string
          started_at: string
          stream_url: string | null
          title: string
          user_id: string
        }
        Insert: {
          ended_at?: string | null
          id?: string
          started_at?: string
          stream_url?: string | null
          title: string
          user_id: string
        }
        Update: {
          ended_at?: string | null
          id?: string
          started_at?: string
          stream_url?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lives_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          city: string | null
          country: string | null
          country_code: string | null
          created_at: string | null
          created_by: string | null
          display_address: string | null
          id: string
          latitude: number | null
          longitude: number | null
          metadata: Json | null
          name: string
          provider: string
          provider_place_id: string | null
          region: string | null
          slug: string | null
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by?: string | null
          display_address?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          metadata?: Json | null
          name: string
          provider: string
          provider_place_id?: string | null
          region?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by?: string | null
          display_address?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          metadata?: Json | null
          name?: string
          provider?: string
          provider_place_id?: string | null
          region?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentions: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          mentioned_user_id: string
          source_id: string
          source_type: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          mentioned_user_id: string
          source_id: string
          source_type: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          mentioned_user_id?: string
          source_id?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          id: string
          message_id: string
          reaction: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          reaction: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          reaction?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          id: string
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reports: {
        Row: {
          conversation_id: string
          created_at: string
          details: string | null
          id: string
          message_id: string
          reason: string
          reporter_id: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          details?: string | null
          id?: string
          message_id: string
          reason: string
          reporter_id: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          details?: string | null
          id?: string
          message_id?: string
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reports_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_requests: {
        Row: {
          category: Database["public"]["Enums"]["message_request_category"]
          created_at: string
          id: string
          receiver_id: string
          sender_id: string
          status: Database["public"]["Enums"]["message_request_status"]
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["message_request_category"]
          created_at?: string
          id?: string
          receiver_id: string
          sender_id: string
          status?: Database["public"]["Enums"]["message_request_status"]
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["message_request_category"]
          created_at?: string
          id?: string
          receiver_id?: string
          sender_id?: string
          status?: Database["public"]["Enums"]["message_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_requests_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_url: string | null
          audio_duration: number | null
          audio_mime: string | null
          audio_path: string | null
          audio_size: number | null
          audio_url: string | null
          content: string | null
          conversation_id: string | null
          created_at: string
          gif_id: string | null
          gif_url: string | null
          id: string
          image_url: string | null
          is_gif: boolean | null
          is_image: boolean | null
          is_sticker: boolean | null
          is_system: boolean | null
          media_url: string | null
          message_type: Database["public"]["Enums"]["message_type_enum"] | null
          read: boolean
          receiver_id: string | null
          reply_to_id: string | null
          sender_id: string
          sticker_id: string | null
          sticker_set: string | null
          sticker_url: string | null
        }
        Insert: {
          attachment_url?: string | null
          audio_duration?: number | null
          audio_mime?: string | null
          audio_path?: string | null
          audio_size?: number | null
          audio_url?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          gif_id?: string | null
          gif_url?: string | null
          id?: string
          image_url?: string | null
          is_gif?: boolean | null
          is_image?: boolean | null
          is_sticker?: boolean | null
          is_system?: boolean | null
          media_url?: string | null
          message_type?: Database["public"]["Enums"]["message_type_enum"] | null
          read?: boolean
          receiver_id?: string | null
          reply_to_id?: string | null
          sender_id: string
          sticker_id?: string | null
          sticker_set?: string | null
          sticker_url?: string | null
        }
        Update: {
          attachment_url?: string | null
          audio_duration?: number | null
          audio_mime?: string | null
          audio_path?: string | null
          audio_size?: number | null
          audio_url?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          gif_id?: string | null
          gif_url?: string | null
          id?: string
          image_url?: string | null
          is_gif?: boolean | null
          is_image?: boolean | null
          is_sticker?: boolean | null
          is_system?: boolean | null
          media_url?: string | null
          message_type?: Database["public"]["Enums"]["message_type_enum"] | null
          read?: boolean
          receiver_id?: string | null
          reply_to_id?: string | null
          sender_id?: string
          sticker_id?: string | null
          sticker_set?: string | null
          sticker_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      music_library: {
        Row: {
          artist: string | null
          created_at: string
          created_by: string | null
          duration: number | null
          id: string
          is_trending: boolean
          source_type: string
          start_at: number | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          url: string
          usage_count: number
          video_id: string | null
        }
        Insert: {
          artist?: string | null
          created_at?: string
          created_by?: string | null
          duration?: number | null
          id?: string
          is_trending?: boolean
          source_type: string
          start_at?: number | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          url: string
          usage_count?: number
          video_id?: string | null
        }
        Update: {
          artist?: string | null
          created_at?: string
          created_by?: string | null
          duration?: number | null
          id?: string
          is_trending?: boolean
          source_type?: string
          start_at?: number | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          url?: string
          usage_count?: number
          video_id?: string | null
        }
        Relationships: []
      }
      music_usage: {
        Row: {
          id: string
          music_id: string
          used_at: string
          user_id: string
        }
        Insert: {
          id?: string
          music_id: string
          used_at?: string
          user_id: string
        }
        Update: {
          id?: string
          music_id?: string
          used_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "music_usage_music_id_fkey"
            columns: ["music_id"]
            isOneToOne: false
            referencedRelation: "music_library"
            referencedColumns: ["id"]
          },
        ]
      }
      muted_users: {
        Row: {
          created_at: string
          id: string
          muted_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          muted_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          muted_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_delivery_settings: {
        Row: {
          channel: string
          created_at: string
          id: string
          is_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          category: string
          created_at: string
          email_enabled: boolean
          id: string
          push_enabled: boolean
          sms_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          email_enabled?: boolean
          id?: string
          push_enabled?: boolean
          sms_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          email_enabled?: boolean
          id?: string
          push_enabled?: boolean
          sms_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string
          comment_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          post_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id: string
          comment_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          post_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string
          comment_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          post_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      other_names: {
        Row: {
          created_at: string
          id: string
          name: string
          show_at_top: boolean | null
          type: string
          updated_at: string
          user_id: string
          visibility: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          show_at_top?: boolean | null
          type: string
          updated_at?: string
          user_id: string
          visibility?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          show_at_top?: boolean | null
          type?: string
          updated_at?: string
          user_id?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "other_names_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      page_followers: {
        Row: {
          followed_at: string
          page_id: string
          role: Database["public"]["Enums"]["page_follower_role"] | null
          user_id: string
        }
        Insert: {
          followed_at?: string
          page_id: string
          role?: Database["public"]["Enums"]["page_follower_role"] | null
          user_id: string
        }
        Update: {
          followed_at?: string
          page_id?: string
          role?: Database["public"]["Enums"]["page_follower_role"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_followers_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_followers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          admin_id: string
          category: string | null
          cover_image: string | null
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          admin_id: string
          category?: string | null
          cover_image?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          admin_id?: string
          category?: string | null
          cover_image?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pages_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pinned_messages: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          message_id: string
          pinned_by: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          message_id: string
          pinned_by: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          message_id?: string
          pinned_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinned_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_messages_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_notifications: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_shares: {
        Row: {
          created_at: string
          id: string
          message: string | null
          post_id: string
          user_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          post_id: string
          user_id: string
          visibility?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          post_id?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_shares_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_tags: {
        Row: {
          created_at: string
          id: string
          post_id: string
          tagged_by: string
          tagged_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          tagged_by: string
          tagged_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          tagged_by?: string
          tagged_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_tags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_tags_tagged_by_fkey"
            columns: ["tagged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_tags_tagged_user_id_fkey"
            columns: ["tagged_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          ai_label: boolean | null
          alt_text: string | null
          aspect_ratio: string | null
          audience_excluded_user_ids: string[] | null
          audience_list_id: string | null
          audience_type: string | null
          audience_user_ids: string[] | null
          boost: boolean | null
          comment_count: number | null
          comments_count: number | null
          comments_enabled: boolean | null
          content: string | null
          created_at: string
          duration: number | null
          feeling_activity_emoji: string | null
          feeling_activity_target_id: string | null
          feeling_activity_target_text: string | null
          feeling_activity_text: string | null
          feeling_activity_type: string | null
          hide_like_count: boolean | null
          hide_share_count: boolean | null
          id: string
          like_count: number | null
          likes_count: number | null
          location_address: string | null
          location_id: string | null
          location_lat: number | null
          location_lng: number | null
          location_name: string | null
          location_provider: string | null
          media_type: string | null
          media_url: string | null
          music_artist: string | null
          music_source: string | null
          music_start: number | null
          music_thumbnail_url: string | null
          music_title: string | null
          music_url: string | null
          music_video_id: string | null
          post_to_story: boolean | null
          product_details: Json | null
          reminder_at: string | null
          scheduled_at: string | null
          share_count: number | null
          shared_post_id: string | null
          shares_count: number
          status: string | null
          tagged_people: Json | null
          thumbnail: string | null
          type: Database["public"]["Enums"]["post_type_new"] | null
          user_id: string
          visibility: string | null
        }
        Insert: {
          ai_label?: boolean | null
          alt_text?: string | null
          aspect_ratio?: string | null
          audience_excluded_user_ids?: string[] | null
          audience_list_id?: string | null
          audience_type?: string | null
          audience_user_ids?: string[] | null
          boost?: boolean | null
          comment_count?: number | null
          comments_count?: number | null
          comments_enabled?: boolean | null
          content?: string | null
          created_at?: string
          duration?: number | null
          feeling_activity_emoji?: string | null
          feeling_activity_target_id?: string | null
          feeling_activity_target_text?: string | null
          feeling_activity_text?: string | null
          feeling_activity_type?: string | null
          hide_like_count?: boolean | null
          hide_share_count?: boolean | null
          id?: string
          like_count?: number | null
          likes_count?: number | null
          location_address?: string | null
          location_id?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_name?: string | null
          location_provider?: string | null
          media_type?: string | null
          media_url?: string | null
          music_artist?: string | null
          music_source?: string | null
          music_start?: number | null
          music_thumbnail_url?: string | null
          music_title?: string | null
          music_url?: string | null
          music_video_id?: string | null
          post_to_story?: boolean | null
          product_details?: Json | null
          reminder_at?: string | null
          scheduled_at?: string | null
          share_count?: number | null
          shared_post_id?: string | null
          shares_count?: number
          status?: string | null
          tagged_people?: Json | null
          thumbnail?: string | null
          type?: Database["public"]["Enums"]["post_type_new"] | null
          user_id: string
          visibility?: string | null
        }
        Update: {
          ai_label?: boolean | null
          alt_text?: string | null
          aspect_ratio?: string | null
          audience_excluded_user_ids?: string[] | null
          audience_list_id?: string | null
          audience_type?: string | null
          audience_user_ids?: string[] | null
          boost?: boolean | null
          comment_count?: number | null
          comments_count?: number | null
          comments_enabled?: boolean | null
          content?: string | null
          created_at?: string
          duration?: number | null
          feeling_activity_emoji?: string | null
          feeling_activity_target_id?: string | null
          feeling_activity_target_text?: string | null
          feeling_activity_text?: string | null
          feeling_activity_type?: string | null
          hide_like_count?: boolean | null
          hide_share_count?: boolean | null
          id?: string
          like_count?: number | null
          likes_count?: number | null
          location_address?: string | null
          location_id?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_name?: string | null
          location_provider?: string | null
          media_type?: string | null
          media_url?: string | null
          music_artist?: string | null
          music_source?: string | null
          music_start?: number | null
          music_thumbnail_url?: string | null
          music_title?: string | null
          music_url?: string | null
          music_video_id?: string | null
          post_to_story?: boolean | null
          product_details?: Json | null
          reminder_at?: string | null
          scheduled_at?: string | null
          share_count?: number | null
          shared_post_id?: string | null
          shares_count?: number
          status?: string | null
          tagged_people?: Json | null
          thumbnail?: string | null
          type?: Database["public"]["Enums"]["post_type_new"] | null
          user_id?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_shared_post_id_fkey"
            columns: ["shared_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_settings: {
        Row: {
          created_at: string
          id: string
          setting_name: string
          setting_value: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          setting_name: string
          setting_value: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          setting_name?: string
          setting_value?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_details: {
        Row: {
          created_at: string
          field_name: string
          field_value: string | null
          id: string
          profile_id: string
          section: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_name: string
          field_value?: string | null
          id?: string
          profile_id: string
          section: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_name?: string
          field_value?: string | null
          id?: string
          profile_id?: string
          section?: string
          updated_at?: string
        }
        Relationships: []
      }
      profile_posts: {
        Row: {
          created_at: string
          id: string
          message: string | null
          post_id: string
          profile_id: string
          shared_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          post_id: string
          profile_id: string
          shared_by: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          post_id?: string
          profile_id?: string
          shared_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_posts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_posts_shared_by_fkey"
            columns: ["shared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_reports: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          reason: Database["public"]["Enums"]["report_reason"]
          reported_user_id: string
          reporter_user_id: string
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          reason: Database["public"]["Enums"]["report_reason"]
          reported_user_id: string
          reporter_user_id: string
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          reason?: Database["public"]["Enums"]["report_reason"]
          reported_user_id?: string
          reporter_user_id?: string
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          about_you: string | null
          about_you_visibility: string | null
          bio: string | null
          birth_date: string | null
          birth_date_visibility: string | null
          birth_year: number | null
          birth_year_visibility: string | null
          birthday: string | null
          college: string | null
          college_id: string | null
          college_visibility: string | null
          company_id: string | null
          company_visibility: string | null
          cover_pic: string | null
          cover_position_y: number | null
          created_at: string
          display_name: string
          email: string | null
          email_visibility: string | null
          first_name: string | null
          following_visibility: boolean | null
          friends_visibility: string | null
          function: string | null
          function_visibility: string | null
          gender: string | null
          gender_visibility: string | null
          high_school: string | null
          high_school_id: string | null
          high_school_visibility: string | null
          id: string
          last_name: string | null
          middle_name: string | null
          name_changed_at: string | null
          name_pronunciation: string | null
          name_pronunciation_visibility: string | null
          phone_country_code: string | null
          phone_number: string | null
          phone_visibility: string | null
          privacy: string | null
          profile_pic: string | null
          pronouns: string | null
          pronouns_visibility: string | null
          relationship: string | null
          relationship_status: string | null
          relationship_visibility: string | null
          updated_at: string
          username: string
          websites_social_links: Json | null
          websites_visibility: string | null
        }
        Insert: {
          about_you?: string | null
          about_you_visibility?: string | null
          bio?: string | null
          birth_date?: string | null
          birth_date_visibility?: string | null
          birth_year?: number | null
          birth_year_visibility?: string | null
          birthday?: string | null
          college?: string | null
          college_id?: string | null
          college_visibility?: string | null
          company_id?: string | null
          company_visibility?: string | null
          cover_pic?: string | null
          cover_position_y?: number | null
          created_at?: string
          display_name: string
          email?: string | null
          email_visibility?: string | null
          first_name?: string | null
          following_visibility?: boolean | null
          friends_visibility?: string | null
          function?: string | null
          function_visibility?: string | null
          gender?: string | null
          gender_visibility?: string | null
          high_school?: string | null
          high_school_id?: string | null
          high_school_visibility?: string | null
          id: string
          last_name?: string | null
          middle_name?: string | null
          name_changed_at?: string | null
          name_pronunciation?: string | null
          name_pronunciation_visibility?: string | null
          phone_country_code?: string | null
          phone_number?: string | null
          phone_visibility?: string | null
          privacy?: string | null
          profile_pic?: string | null
          pronouns?: string | null
          pronouns_visibility?: string | null
          relationship?: string | null
          relationship_status?: string | null
          relationship_visibility?: string | null
          updated_at?: string
          username: string
          websites_social_links?: Json | null
          websites_visibility?: string | null
        }
        Update: {
          about_you?: string | null
          about_you_visibility?: string | null
          bio?: string | null
          birth_date?: string | null
          birth_date_visibility?: string | null
          birth_year?: number | null
          birth_year_visibility?: string | null
          birthday?: string | null
          college?: string | null
          college_id?: string | null
          college_visibility?: string | null
          company_id?: string | null
          company_visibility?: string | null
          cover_pic?: string | null
          cover_position_y?: number | null
          created_at?: string
          display_name?: string
          email?: string | null
          email_visibility?: string | null
          first_name?: string | null
          following_visibility?: boolean | null
          friends_visibility?: string | null
          function?: string | null
          function_visibility?: string | null
          gender?: string | null
          gender_visibility?: string | null
          high_school?: string | null
          high_school_id?: string | null
          high_school_visibility?: string | null
          id?: string
          last_name?: string | null
          middle_name?: string | null
          name_changed_at?: string | null
          name_pronunciation?: string | null
          name_pronunciation_visibility?: string | null
          phone_country_code?: string | null
          phone_number?: string | null
          phone_visibility?: string | null
          privacy?: string | null
          profile_pic?: string | null
          pronouns?: string | null
          pronouns_visibility?: string | null
          relationship?: string | null
          relationship_status?: string | null
          relationship_visibility?: string | null
          updated_at?: string
          username?: string
          websites_social_links?: Json | null
          websites_visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_college_id_fkey"
            columns: ["college_id"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_high_school_id_fkey"
            columns: ["high_school_id"]
            isOneToOne: false
            referencedRelation: "high_schools"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_backup: {
        Row: {
          bio: string | null
          birth_date: string | null
          birth_date_visibility: string | null
          birth_year: number | null
          birth_year_visibility: string | null
          birthday: string | null
          college: string | null
          college_id: string | null
          college_visibility: string | null
          company_id: string | null
          company_visibility: string | null
          cover_pic: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          email_visibility: string | null
          function: string | null
          function_visibility: string | null
          gender: string | null
          gender_visibility: string | null
          high_school: string | null
          high_school_id: string | null
          high_school_visibility: string | null
          id: string | null
          phone_country_code: string | null
          phone_number: string | null
          phone_visibility: string | null
          profile_pic: string | null
          pronouns: string | null
          pronouns_visibility: string | null
          relationship: string | null
          updated_at: string | null
          username: string | null
          websites_social_links: Json | null
          websites_visibility: string | null
        }
        Insert: {
          bio?: string | null
          birth_date?: string | null
          birth_date_visibility?: string | null
          birth_year?: number | null
          birth_year_visibility?: string | null
          birthday?: string | null
          college?: string | null
          college_id?: string | null
          college_visibility?: string | null
          company_id?: string | null
          company_visibility?: string | null
          cover_pic?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          email_visibility?: string | null
          function?: string | null
          function_visibility?: string | null
          gender?: string | null
          gender_visibility?: string | null
          high_school?: string | null
          high_school_id?: string | null
          high_school_visibility?: string | null
          id?: string | null
          phone_country_code?: string | null
          phone_number?: string | null
          phone_visibility?: string | null
          profile_pic?: string | null
          pronouns?: string | null
          pronouns_visibility?: string | null
          relationship?: string | null
          updated_at?: string | null
          username?: string | null
          websites_social_links?: Json | null
          websites_visibility?: string | null
        }
        Update: {
          bio?: string | null
          birth_date?: string | null
          birth_date_visibility?: string | null
          birth_year?: number | null
          birth_year_visibility?: string | null
          birthday?: string | null
          college?: string | null
          college_id?: string | null
          college_visibility?: string | null
          company_id?: string | null
          company_visibility?: string | null
          cover_pic?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          email_visibility?: string | null
          function?: string | null
          function_visibility?: string | null
          gender?: string | null
          gender_visibility?: string | null
          high_school?: string | null
          high_school_id?: string | null
          high_school_visibility?: string | null
          id?: string | null
          phone_country_code?: string | null
          phone_number?: string | null
          phone_visibility?: string | null
          profile_pic?: string | null
          pronouns?: string | null
          pronouns_visibility?: string | null
          relationship?: string | null
          updated_at?: string | null
          username?: string | null
          websites_social_links?: Json | null
          websites_visibility?: string | null
        }
        Relationships: []
      }
      reactions: {
        Row: {
          created_at: string
          id: string
          post_id: string
          type: Database["public"]["Enums"]["reaction_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          type: Database["public"]["Enums"]["reaction_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          type?: Database["public"]["Enums"]["reaction_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_preference_signals: {
        Row: {
          created_at: string | null
          id: string
          reel_id: string
          signal_type: string
          target_page_id: string | null
          target_user_id: string | null
          user_id: string
          weight: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          reel_id: string
          signal_type: string
          target_page_id?: string | null
          target_user_id?: string | null
          user_id: string
          weight?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          reel_id?: string
          signal_type?: string
          target_page_id?: string | null
          target_user_id?: string | null
          user_id?: string
          weight?: number | null
        }
        Relationships: []
      }
      reel_reports: {
        Row: {
          created_at: string
          description: string | null
          detailed_reason: string | null
          id: string
          main_reason: string | null
          post_type: string | null
          reason: string
          reel_id: string
          reel_owner_id: string | null
          reported_by: string
          status: string | null
          sub_reason: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          detailed_reason?: string | null
          id?: string
          main_reason?: string | null
          post_type?: string | null
          reason: string
          reel_id: string
          reel_owner_id?: string | null
          reported_by: string
          status?: string | null
          sub_reason?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          detailed_reason?: string | null
          id?: string
          main_reason?: string | null
          post_type?: string | null
          reason?: string
          reel_id?: string
          reel_owner_id?: string | null
          reported_by?: string
          status?: string | null
          sub_reason?: string | null
        }
        Relationships: []
      }
      reels_activity: {
        Row: {
          actor_id: string
          created_at: string | null
          id: string
          meta: Json | null
          reel_id: string
          verb: string
        }
        Insert: {
          actor_id: string
          created_at?: string | null
          id?: string
          meta?: Json | null
          reel_id: string
          verb: string
        }
        Update: {
          actor_id?: string
          created_at?: string | null
          id?: string
          meta?: Json | null
          reel_id?: string
          verb?: string
        }
        Relationships: [
          {
            foreignKeyName: "reels_activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reels_activity_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      reels_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string | null
          edited_at: string | null
          id: string
          reel_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string | null
          edited_at?: string | null
          id?: string
          reel_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string | null
          edited_at?: string | null
          id?: string
          reel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reels_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reels_comments_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      reels_likes: {
        Row: {
          created_at: string | null
          id: string
          reel_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          reel_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          reel_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reels_likes_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reels_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reported_posts: {
        Row: {
          created_at: string
          description: string | null
          detailed_reason: string | null
          id: string
          main_reason: string | null
          post_id: string
          post_owner_id: string | null
          post_type: string | null
          post_url: string | null
          reason: string
          reported_by: string
          status: string | null
          sub_reason: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          detailed_reason?: string | null
          id?: string
          main_reason?: string | null
          post_id: string
          post_owner_id?: string | null
          post_type?: string | null
          post_url?: string | null
          reason: string
          reported_by: string
          status?: string | null
          sub_reason?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          detailed_reason?: string | null
          id?: string
          main_reason?: string | null
          post_id?: string
          post_owner_id?: string | null
          post_type?: string | null
          post_url?: string | null
          reason?: string
          reported_by?: string
          status?: string | null
          sub_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reported_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      restricted_users: {
        Row: {
          created_at: string
          id: string
          restricted_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          restricted_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          restricted_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_ads: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          subtitle: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          subtitle?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          subtitle?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_ads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_posts: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      shares: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shares_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sticker_packs: {
        Row: {
          created_at: string
          description: string | null
          emoji: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      stickers: {
        Row: {
          created_at: string
          file_path: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          is_animated: boolean | null
          name: string
          pack_id: string | null
          tags: string[] | null
        }
        Insert: {
          created_at?: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          is_animated?: boolean | null
          name: string
          pack_id?: string | null
          tags?: string[] | null
        }
        Update: {
          created_at?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          is_animated?: boolean | null
          name?: string
          pack_id?: string | null
          tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "stickers_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "sticker_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      stories: {
        Row: {
          caption: string | null
          created_at: string
          duration: number | null
          expires_at: string | null
          id: string
          is_highlight: boolean | null
          media_type: string
          media_url: string
          music_duration: number | null
          music_source_type: string | null
          music_start_at: number | null
          music_thumbnail_url: string | null
          music_title: string | null
          music_url: string | null
          music_video_id: string | null
          privacy: string
          user_id: string
          viewed_by: string[]
          views: number
        }
        Insert: {
          caption?: string | null
          created_at?: string
          duration?: number | null
          expires_at?: string | null
          id?: string
          is_highlight?: boolean | null
          media_type: string
          media_url: string
          music_duration?: number | null
          music_source_type?: string | null
          music_start_at?: number | null
          music_thumbnail_url?: string | null
          music_title?: string | null
          music_url?: string | null
          music_video_id?: string | null
          privacy?: string
          user_id: string
          viewed_by?: string[]
          views?: number
        }
        Update: {
          caption?: string | null
          created_at?: string
          duration?: number | null
          expires_at?: string | null
          id?: string
          is_highlight?: boolean | null
          media_type?: string
          media_url?: string
          music_duration?: number | null
          music_source_type?: string | null
          music_start_at?: number | null
          music_thumbnail_url?: string | null
          music_title?: string | null
          music_url?: string | null
          music_video_id?: string | null
          privacy?: string
          user_id?: string
          viewed_by?: string[]
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "stories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      story_highlight_items: {
        Row: {
          added_at: string
          highlight_id: string
          id: string
          story_id: string
        }
        Insert: {
          added_at?: string
          highlight_id: string
          id?: string
          story_id: string
        }
        Update: {
          added_at?: string
          highlight_id?: string
          id?: string
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_highlight_items_highlight_id_fkey"
            columns: ["highlight_id"]
            isOneToOne: false
            referencedRelation: "story_highlights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_highlight_items_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_highlights: {
        Row: {
          cover_image: string | null
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_image?: string | null
          created_at?: string
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_image?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      story_mentions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          mentioned_user_id: string
          position_x: number | null
          position_y: number | null
          story_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          mentioned_user_id: string
          position_x?: number | null
          position_y?: number | null
          story_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          mentioned_user_id?: string
          position_x?: number | null
          position_y?: number | null
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_mentions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_mentions_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_poll_votes: {
        Row: {
          created_at: string
          id: string
          option_index: number
          poll_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_index: number
          poll_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          option_index?: number
          poll_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "story_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      story_polls: {
        Row: {
          created_at: string
          id: string
          options: Json
          question: string
          story_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          options?: Json
          question: string
          story_id: string
        }
        Update: {
          created_at?: string
          id?: string
          options?: Json
          question?: string
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_polls_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_question_responses: {
        Row: {
          created_at: string
          id: string
          question_id: string
          response: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          question_id: string
          response: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          question_id?: string
          response?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_question_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "story_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_question_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      story_questions: {
        Row: {
          created_at: string
          id: string
          question: string
          story_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          question: string
          story_id: string
        }
        Update: {
          created_at?: string
          id?: string
          question?: string
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_questions_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          story_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          story_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          story_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_reactions_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_views: {
        Row: {
          id: string
          story_id: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          id?: string
          story_id: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          id?: string
          story_id?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_feedback: {
        Row: {
          affected_area: string | null
          attachment_url: string | null
          created_at: string
          id: string
          post_id: string
          post_owner_id: string
          post_type: string
          post_url: string
          reporter_id: string
          status: string
          user_message: string | null
        }
        Insert: {
          affected_area?: string | null
          attachment_url?: string | null
          created_at?: string
          id?: string
          post_id: string
          post_owner_id: string
          post_type: string
          post_url: string
          reporter_id: string
          status?: string
          user_message?: string | null
        }
        Update: {
          affected_area?: string | null
          attachment_url?: string | null
          created_at?: string
          id?: string
          post_id?: string
          post_owner_id?: string
          post_type?: string
          post_url?: string
          reporter_id?: string
          status?: string
          user_message?: string | null
        }
        Relationships: []
      }
      user_activity: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_device_keys: {
        Row: {
          created_at: string
          device_name: string
          hex_key: string
          id: string
          last_seen_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name: string
          hex_key: string
          id?: string
          last_seen_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string
          hex_key?: string
          id?: string
          last_seen_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_device_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          id: string
          see_less_reel_ids: string[] | null
          see_less_reels: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          see_less_reel_ids?: string[] | null
          see_less_reels?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          see_less_reel_ids?: string[] | null
          see_less_reels?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      hashtag_analytics: {
        Row: {
          created_at: string | null
          follower_count: number | null
          id: string | null
          post_count: number | null
          posts_last_day: number | null
          posts_last_hour: number | null
          posts_last_month: number | null
          posts_last_week: number | null
          posts_last_year: number | null
          tag: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_or_increment_music: {
        Args: {
          p_artist?: string
          p_duration?: number
          p_source_type?: string
          p_thumbnail_url?: string
          p_title: string
          p_url: string
          p_user_id?: string
          p_video_id?: string
        }
        Returns: Json
      }
      add_reel_comment: {
        Args: { p_body: string; p_reel_id: string; p_user_id: string }
        Returns: Json
      }
      are_users_friends: {
        Args: { user_a: string; user_b: string }
        Returns: boolean
      }
      block_user:
        | { Args: { p_blocked: string; p_blocker: string }; Returns: undefined }
        | {
            Args: {
              p_block_type?: string
              p_blocked: string
              p_blocker: string
            }
            Returns: undefined
          }
      can_see_content: {
        Args: {
          p_content_id: string
          p_content_owner_id: string
          p_viewer_id: string
        }
        Returns: boolean
      }
      can_view_post: {
        Args: {
          audience_excluded_user_ids: string[]
          audience_list_id: string
          audience_type: string
          audience_user_ids: string[]
          post_user_id: string
          viewer_id: string
        }
        Returns: boolean
      }
      can_view_profile_field: {
        Args: {
          field_visibility: string
          profile_user_id: string
          viewer_id: string
        }
        Returns: boolean
      }
      create_message_with_audio: {
        Args: {
          p_audio_duration: number
          p_audio_mime: string
          p_audio_path: string
          p_audio_size: number
          p_content?: string
          p_conversation_id: string
          p_sender_id: string
        }
        Returns: string
      }
      determine_request_category: {
        Args: { receiver_id: string; sender_id: string }
        Returns: Database["public"]["Enums"]["message_request_category"]
      }
      get_blocked_user_ids: { Args: { p_user_id: string }; Returns: string[] }
      get_call_history: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          call_type: string
          duration_seconds: number
          id: string
          is_outgoing: boolean
          other_user_display_name: string
          other_user_id: string
          other_user_profile_pic: string
          other_user_username: string
          started_at: string
          status: string
        }[]
      }
      get_conversations_with_info: {
        Args: { p_user_id?: string }
        Returns: {
          conversation_id: string
          created_at: string
          last_message_content: string
          last_message_created_at: string
          other_user_display_name: string
          other_user_id: string
          other_user_profile_pic: string
          other_user_username: string
          type: string
          unread_count: number
          updated_at: string
        }[]
      }
      get_encryption_details: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
      get_hidden_content_ids: { Args: { p_user_id: string }; Returns: string[] }
      get_hidden_profile_ids: { Args: { p_user_id: string }; Returns: string[] }
      get_music_library_with_stats: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      get_mutual_friends_count: {
        Args: { user_a: string; user_b: string }
        Returns: number
      }
      get_or_create_conversation_settings: {
        Args: { p_conversation_id: string }
        Returns: {
          chat_theme: string
          conversation_id: string
          created_at: string
          id: string
          is_muted: boolean
          messaging_controls: Json | null
          quick_emoji: string | null
          read_receipts_enabled: boolean
          updated_at: string
          user_id: string
          vanishing_messages_duration: number | null
          vanishing_messages_enabled: boolean
        }
        SetofOptions: {
          from: "*"
          to: "conversation_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_or_create_dm: {
        Args: { p_user_a: string; p_user_b: string }
        Returns: string
      }
      get_people_you_may_know: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          display_name: string
          id: string
          mutual_friends_count: number
          profile_pic: string
          username: string
        }[]
      }
      get_trending_music: { Args: { p_limit?: number }; Returns: Json }
      get_unread_count: {
        Args: { p_conversation_id: string; p_user_id?: string }
        Returns: number
      }
      increment_post_share_counts: {
        Args: { p_post_id: string }
        Returns: undefined
      }
      is_blocked: {
        Args: { user1_id: string; user2_id: string }
        Returns: boolean
      }
      is_content_hidden: {
        Args: {
          p_content_id: string
          p_content_owner_id?: string
          p_user_id: string
        }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { p_conversation_id: string; p_user_id?: string }
        Returns: boolean
      }
      is_friend: {
        Args: { target_id: string; viewer_id: string }
        Returns: boolean
      }
      log_call: {
        Args: {
          p_call_type: string
          p_caller_id: string
          p_duration_seconds?: number
          p_receiver_id: string
          p_status: string
        }
        Returns: string
      }
      mark_messages_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      toggle_reel_like: {
        Args: { p_reel_id: string; p_user_id: string }
        Returns: Json
      }
      update_conversation_quick_emoji: {
        Args: { p_conversation_id: string; p_quick_emoji: string }
        Returns: Json
      }
      update_conversation_settings: {
        Args: {
          p_conversation_id: string
          p_is_muted?: boolean
          p_quick_emoji?: string
          p_read_receipts_enabled?: boolean
          p_vanishing_messages_duration?: number
          p_vanishing_messages_enabled?: boolean
        }
        Returns: {
          chat_theme: string
          conversation_id: string
          created_at: string
          id: string
          is_muted: boolean
          messaging_controls: Json | null
          quick_emoji: string | null
          read_receipts_enabled: boolean
          updated_at: string
          user_id: string
          vanishing_messages_duration: number | null
          vanishing_messages_enabled: boolean
        }
        SetofOptions: {
          from: "*"
          to: "conversation_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_conversation_theme: {
        Args: { p_chat_theme: string; p_conversation_id: string }
        Returns: Json
      }
      update_messaging_controls: {
        Args: {
          p_conversation_id: string
          p_message_requests_enabled?: boolean
          p_who_can_reply?: string
        }
        Returns: {
          chat_theme: string
          conversation_id: string
          created_at: string
          id: string
          is_muted: boolean
          messaging_controls: Json | null
          quick_emoji: string | null
          read_receipts_enabled: boolean
          updated_at: string
          user_id: string
          vanishing_messages_duration: number | null
          vanishing_messages_enabled: boolean
        }
        SetofOptions: {
          from: "*"
          to: "conversation_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_music_trending_status: { Args: never; Returns: undefined }
      verify_conversation_encryption: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
    }
    Enums: {
      content_report_status:
        | "pending"
        | "reviewed"
        | "action_taken"
        | "rejected"
      content_type: "reel" | "video" | "normal_post" | "story" | "profile"
      group_role: "admin" | "moderator" | "member"
      message_request_category: "you_may_know" | "spam"
      message_request_status: "pending" | "accepted" | "declined" | "blocked"
      message_type_enum:
        | "text"
        | "image"
        | "gif"
        | "sticker"
        | "audio"
        | "video"
        | "file"
      page_follower_role: "follower" | "admin" | "editor"
      post_type_new:
        | "normal_post"
        | "profile_picture_update"
        | "cover_photo_update"
        | "shared_post"
        | "reel"
      reaction_type:
        | "like"
        | "love"
        | "haha"
        | "wow"
        | "sad"
        | "angry"
        | "ok"
        | "red_heart"
        | "laughing"
        | "astonished"
        | "cry"
        | "rage"
        | "hug_face"
      report_reason:
        | "fake_account"
        | "harassment"
        | "inappropriate_content"
        | "other"
      report_status: "pending" | "reviewed" | "resolved"
      visibility_enum: "public" | "friends" | "private"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      content_report_status: [
        "pending",
        "reviewed",
        "action_taken",
        "rejected",
      ],
      content_type: ["reel", "video", "normal_post", "story", "profile"],
      group_role: ["admin", "moderator", "member"],
      message_request_category: ["you_may_know", "spam"],
      message_request_status: ["pending", "accepted", "declined", "blocked"],
      message_type_enum: [
        "text",
        "image",
        "gif",
        "sticker",
        "audio",
        "video",
        "file",
      ],
      page_follower_role: ["follower", "admin", "editor"],
      post_type_new: [
        "normal_post",
        "profile_picture_update",
        "cover_photo_update",
        "shared_post",
        "reel",
      ],
      reaction_type: [
        "like",
        "love",
        "haha",
        "wow",
        "sad",
        "angry",
        "ok",
        "red_heart",
        "laughing",
        "astonished",
        "cry",
        "rage",
        "hug_face",
      ],
      report_reason: [
        "fake_account",
        "harassment",
        "inappropriate_content",
        "other",
      ],
      report_status: ["pending", "reviewed", "resolved"],
      visibility_enum: ["public", "friends", "private"],
    },
  },
} as const
