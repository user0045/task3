import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Layout from '@/components/Layout';
import ChatList from '@/components/ChatList';
import ChatBox from '@/components/ChatBox';
import AddUserToChat from '@/components/AddUserToChat';
import { ChatType, MessageType, FileAttachment } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { extendedSupabase } from '@/integrations/supabase/extended-client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';

const Chat = () => {
  const [chats, setChats] = useState<ChatType[]>([]);
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [activeChat, setActiveChat] = useState<ChatType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const fetchChats = async () => {
      try {
        if (!user) return;
        
        setIsLoading(true);
        
        // Query chats where the current user is a participant with last message
        const { data: chatsData, error: chatsError } = await extendedSupabase
          .from('chats')
          .select(`
            *,
            messages:messages(content, timestamp, read)
          `)
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
          .order('created_at', { ascending: false });
          
        if (chatsError) {
          console.error('Error fetching chats:', chatsError);
          throw chatsError;
        }
        
        // Transform data into ChatType objects
        const processedChats: ChatType[] = await Promise.all(
          (chatsData || []).map(async (chat) => {
            // Determine the other participant (not the current user)
            const isUser1 = chat.user1_id === user.id;
            const participantId = isUser1 ? chat.user2_id : chat.user1_id;
            
            // Get the other participant's data
            const { data: participantData } = await supabase
              .from('profiles')
              .select('username')
              .eq('id', participantId)
              .single();
            
            const participantName = participantData?.username || 'Unknown User';
            
            // Process messages from the joined data
            const messages = chat.messages || [];
            const lastMessage = messages[0];
            const unreadCount = messages.filter(msg => !msg.read && msg.receiver_id === user.id).length;
            
            return {
              id: chat.id,
              participantId,
              participantName,
              lastMessage: lastMessage?.content,
              lastMessageTime: lastMessage ? new Date(lastMessage.timestamp) : undefined,
              unreadCount,
            };
          })
        );
        
        setChats(processedChats);
        
        // Check if there's an active chat in the location state (from navigation)
        if (location.state && location.state.activeChatId) {
          const chatFromState = processedChats.find(
            chat => chat.id === location.state.activeChatId
          );
          
          if (chatFromState) {
            setActiveChat(chatFromState);
            fetchMessages(chatFromState.id);
          }
        } else if (processedChats.length > 0) {
          // Set the first chat as active by default
          setActiveChat(processedChats[0]);
          fetchMessages(processedChats[0].id);
        }
      } catch (error) {
        console.error('Error in fetchChats:', error);
        toast({
          title: "Error",
          description: "Failed to load chats. Please try again later.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchChats();
    
    // Set up real-time subscription for chats
    const chatChannel = supabase
      .channel('public:chats')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'chats',
          filter: `user1_id=eq.${user?.id}` 
        }, 
        () => {
          fetchChats();
        }
      )
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'chats',
          filter: `user2_id=eq.${user?.id}` 
        }, 
        () => {
          fetchChats();
        }
      )
      .subscribe();
      
    // Set up real-time subscription for messages
    const messageChannel = supabase
      .channel('public:messages')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'messages',
          filter: activeChat ? `chat_id=eq.${activeChat.id}` : undefined
        }, 
        async (payload) => {
          try {
            if (payload.eventType === 'INSERT') {
              const { data: senderData } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', payload.new.sender_id)
                .single();

              const newMessage = {
                id: payload.new.id,
                senderId: payload.new.sender_id,
                senderName: senderData?.username || 'Unknown User',
                receiverId: payload.new.receiver_id,
                content: payload.new.content,
                timestamp: new Date(payload.new.timestamp),
                read: payload.new.read || false,
              };

              setMessages(prev => [...prev, newMessage]);
              
              // Mark message as read if it's for current user
              if (payload.new.receiver_id === user?.id && !payload.new.read) {
                await supabase
                  .from('messages')
                  .update({ read: true })
                  .eq('id', payload.new.id);
              }
            }
            
            // Refresh chat list to update unread counts and last messages
            await fetchChats();
          } catch (error) {
            console.error('Error handling message change:', error);
            toast({
              title: "Error",
              description: "Failed to update messages. Please refresh the page.",
              variant: "destructive"
            });
          }
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(chatChannel);
      supabase.removeChannel(messageChannel);
    };
  }, [user, toast, location]);
  
  const fetchMessages = async (chatId: string) => {
    try {
      if (!user) return;
      
      // Fix the query to not use join but get sender data separately
      const { data: messagesData, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('timestamp', { ascending: true });
        
      if (error) throw error;
      
      // Process messages and fetch sender names separately
      const messagePromises = (messagesData || []).map(async (message) => {
        // Fetch sender profile
        const { data: senderData } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', message.sender_id)
          .single();
        
        return {
          id: message.id,
          senderId: message.sender_id,
          senderName: senderData?.username || 'Unknown User',
          receiverId: message.receiver_id,
          content: message.content,
          timestamp: new Date(message.timestamp),
          read: message.read || false,
        };
      });
      
      const formattedMessages = await Promise.all(messagePromises);
      setMessages(formattedMessages);
      
      // Mark messages as read
      const unreadMessages = messagesData
        .filter(msg => !msg.read && msg.sender_id !== user.id)
        .map(msg => msg.id);
        
      if (unreadMessages.length > 0) {
        await supabase
          .from('messages')
          .update({ read: true })
          .in('id', unreadMessages);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast({
        title: "Error",
        description: "Failed to load messages. Please try again later.",
        variant: "destructive"
      });
    }
  };
  
  const handleChatSelect = (chat: ChatType) => {
    setActiveChat(chat);
    fetchMessages(chat.id);
  };
  
  const handleSendMessage = async (content: string, attachment?: FileAttachment) => {
    try {
      if (!user || !activeChat) return;
      
      const newMessage = {
        chat_id: activeChat.id,
        sender_id: user.id,
        receiver_id: activeChat.participantId,
        content: content,
        read: false,
        // We'd handle attachment separately in a real app with file storage
      };
      
      const { error } = await supabase
        .from('messages')
        .insert(newMessage);
        
      if (error) throw error;
      
      // We don't need to manually update the state here as the realtime
      // subscription will handle that
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  const handleUserAdded = (chatId: string, userId: string, username: string) => {
    const newChat: ChatType = {
      id: chatId,
      participantId: userId,
      participantName: username,
      unreadCount: 0
    };
    
    setChats(prevChats => [newChat, ...prevChats]);
    setActiveChat(newChat);
    fetchMessages(chatId);
  };
  
  return (
    <Layout requireAuth>
      <div className="container mx-auto px-4 py-8">
        <div className="flex h-[calc(100vh-200px)] bg-background border rounded-lg overflow-hidden">
          <div className="w-1/3 border-r">
            <ChatList 
              chats={chats}
              activeChat={activeChat}
              onChatSelect={handleChatSelect}
              isLoading={isLoading}
              searchBarRight={<AddUserToChat onUserAdded={handleUserAdded} />}
            />
          </div>
          
          <div className="w-2/3">
            {activeChat ? (
              <ChatBox 
                chat={activeChat} 
                messages={messages} 
                onSendMessage={handleSendMessage} 
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-muted-foreground">
                  {chats.length > 0 
                    ? 'Select a conversation to start chatting' 
                    : 'No conversations yet. Add a user to start chatting!'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Chat;
