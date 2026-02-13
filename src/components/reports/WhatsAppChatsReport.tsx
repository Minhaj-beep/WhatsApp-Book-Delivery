import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { MessageCircle, Clock, Phone } from 'lucide-react';

interface WhatsAppMessage {
  id: string;
  phone: string;
  direction: 'in' | 'out';
  raw_payload: any;
  ts: string;
}

interface ConversationGroup {
  phone: string;
  messages: WhatsAppMessage[];
  lastMessage: string;
  lastMessageTime: string;
}

export default function WhatsAppChatsReport() {
  const [conversations, setConversations] = useState<ConversationGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

  useEffect(() => {
    loadMessages();
  }, []);

  async function loadMessages() {
    try {
      const { data: messages, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .order('ts', { ascending: false });

      if (error) throw error;

      const grouped: { [key: string]: WhatsAppMessage[] } = {};
      messages?.forEach((msg) => {
        if (!grouped[msg.phone]) {
          grouped[msg.phone] = [];
        }
        grouped[msg.phone].push(msg);
      });

      const conversationList: ConversationGroup[] = Object.entries(grouped).map(([phone, msgs]) => {
        const latest = msgs[0];
        const messageText = latest.direction === 'in'
          ? (latest.raw_payload?.Body || 'Message')
          : 'Reply sent';

        return {
          phone,
          messages: msgs,
          lastMessage: messageText,
          lastMessageTime: latest.ts,
        };
      });

      setConversations(conversationList);
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  }

  const selectedConversation = conversations.find(c => c.phone === selectedPhone);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-slate-200 rounded w-48"></div>
        <div className="h-32 bg-slate-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <MessageCircle className="w-6 h-6 text-green-600" />
        <h2 className="text-xl font-bold text-slate-900">WhatsApp Conversations</h2>
      </div>

      {conversations.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No conversations yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Recent Chats</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {conversations.map((conv) => (
                <button
                  key={conv.phone}
                  onClick={() => setSelectedPhone(conv.phone)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition ${
                    selectedPhone === conv.phone
                      ? 'border-green-600 bg-green-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-600" />
                      <span className="font-semibold text-slate-900">{conv.phone}</span>
                    </div>
                    <span className="text-xs text-slate-500">
                      {new Date(conv.lastMessageTime).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 truncate">{conv.lastMessage}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-slate-500">{conv.messages.length} messages</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Message History</h3>
            {selectedConversation ? (
              <div className="border-2 border-slate-200 rounded-lg p-4 max-h-96 overflow-y-auto">
                <div className="space-y-3">
                  {selectedConversation.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-lg ${
                        msg.direction === 'in'
                          ? 'bg-slate-100 ml-0 mr-8'
                          : 'bg-green-100 ml-8 mr-0'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <span className={`text-xs font-semibold ${
                          msg.direction === 'in' ? 'text-slate-600' : 'text-green-700'
                        }`}>
                          {msg.direction === 'in' ? 'Customer' : 'System'}
                        </span>
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="w-3 h-3" />
                          {new Date(msg.ts).toLocaleTimeString()}
                        </div>
                      </div>
                      <p className="text-sm text-slate-900">
                        {msg.direction === 'in'
                          ? (msg.raw_payload?.Body || 'Message')
                          : 'Reply sent'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border-2 border-slate-200 rounded-lg p-8 text-center text-slate-500">
                Select a conversation to view messages
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
