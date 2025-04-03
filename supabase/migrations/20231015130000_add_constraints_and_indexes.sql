-- Add foreign key constraints and indexes for better data consistency and performance

-- Messages table constraints and indexes
DO $$
BEGIN
    -- Add foreign key for sender_id if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'messages_sender_id_fkey'
    ) THEN
        ALTER TABLE public.messages
        ADD CONSTRAINT messages_sender_id_fkey
        FOREIGN KEY (sender_id) REFERENCES public.profiles(id)
        ON DELETE CASCADE;
    END IF;

    -- Add foreign key for chat_id if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'messages_chat_id_fkey'
    ) THEN
        ALTER TABLE public.messages
        ADD CONSTRAINT messages_chat_id_fkey
        FOREIGN KEY (chat_id) REFERENCES public.chats(id)
        ON DELETE CASCADE;
    END IF;

    -- Add indexes for better query performance
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_messages_chat_id'
    ) THEN
        CREATE INDEX idx_messages_chat_id ON public.messages(chat_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_messages_sender_id'
    ) THEN
        CREATE INDEX idx_messages_sender_id ON public.messages(sender_id);
    END IF;
END $$;

-- Chats table constraints and indexes
DO $$
BEGIN
    -- Add foreign keys for user1_id and user2_id if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'chats_user1_id_fkey'
    ) THEN
        ALTER TABLE public.chats
        ADD CONSTRAINT chats_user1_id_fkey
        FOREIGN KEY (user1_id) REFERENCES public.profiles(id)
        ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'chats_user2_id_fkey'
    ) THEN
        ALTER TABLE public.chats
        ADD CONSTRAINT chats_user2_id_fkey
        FOREIGN KEY (user2_id) REFERENCES public.profiles(id)
        ON DELETE CASCADE;
    END IF;

    -- Add indexes for better query performance
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_chats_user1_id'
    ) THEN
        CREATE INDEX idx_chats_user1_id ON public.chats(user1_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_chats_user2_id'
    ) THEN
        CREATE INDEX idx_chats_user2_id ON public.chats(user2_id);
    END IF;

    -- Add composite index for faster chat lookup
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_chats_users'
    ) THEN
        CREATE INDEX idx_chats_users ON public.chats(user1_id, user2_id);
    END IF;
END $$;

-- Add check constraints for ratings
DO $$
BEGIN
    -- Add check constraint for requestor_rating if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'check_requestor_rating_range'
    ) THEN
        ALTER TABLE public.profiles
        ADD CONSTRAINT check_requestor_rating_range
        CHECK (requestor_rating >= 0 AND requestor_rating <= 5);
    END IF;

    -- Add check constraint for doer_rating if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'check_doer_rating_range'
    ) THEN
        ALTER TABLE public.profiles
        ADD CONSTRAINT check_doer_rating_range
        CHECK (doer_rating >= 0 AND doer_rating <= 5);
    END IF;
END $$;