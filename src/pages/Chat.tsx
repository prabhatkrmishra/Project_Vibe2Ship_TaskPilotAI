import { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { Task } from '../types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { ScrollArea } from '../components/ui/scroll-area';
import { Send, Bot, User as UserIcon, Loader2, Mic } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function Chat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user && messages.length === 0) {
      setMessages([
        { role: 'assistant', content: `Hello, ${user.displayName?.split(' ')[0] || 'there'}! I am TaskPilot. How can I help you optimize your day?` }
      ]);
    }
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user) return;
    
    const userMsg = input.trim();
    setInput('');
    const newMessages = [...messages, { role: 'user' as const, content: userMsg }];
    setMessages(newMessages);
    setIsSending(true);
    
    try {
      const db = getDb();
      const q = query(
        collection(db, 'tasks'), 
        where('userId', '==', user.uid),
        where('status', 'in', ['pending', 'in_progress'])
      );
      const snapshot = await getDocs(q);
      const tasksContext = snapshot.docs.map(doc => doc.data());
      
      const token = await user.getIdToken();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ messages: newMessages, context: tasksContext })
      });
      const data = await res.json();
      
      setMessages(prev => [...prev, { role: 'assistant', content: data.text }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error while thinking.' }]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto h-full flex flex-col">
      <div className="mb-6 px-2">
        <h1 className="text-3xl font-light text-[#f0f6fc] leading-tight">Pilot <br/><span className="font-semibold italic text-indigo-400">Intelligence</span></h1>
        <p className="text-[#8b949e] mt-2">Ask for schedule adjustments, task breakdowns, or productivity advice.</p>
      </div>

      <div className="flex-1 flex flex-col min-h-0 bg-[#0d1117] border border-[#21262d] rounded-3xl overflow-hidden shadow-2xl">
        <div className="flex-1 flex flex-col p-0 min-h-0 overflow-hidden">
          <ScrollArea className="flex-1 p-6" ref={scrollRef}>
            <div className="space-y-6">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-indigo-500/20 text-indigo-400 font-bold text-[10px] uppercase border border-indigo-500/30' : 'bg-[#161b22] border border-[#21262d]'}`}>
                    {msg.role === 'user' ? 'YOU' : <Bot className="w-4 h-4 text-cyan-400" />}
                  </div>
                  <div className={`max-w-[80%] px-5 py-3 ${msg.role === 'user' ? 'bg-indigo-600/20 text-indigo-50 border border-indigo-500/30 rounded-2xl rounded-tr-none' : 'bg-slate-800/60 border-l-2 border-cyan-500/30 rounded-2xl rounded-tl-none'}`}>
                    {msg.role === 'user' ? (
                       <p className="text-sm">{msg.content}</p>
                    ) : (
                      <div className="prose prose-sm prose-invert max-w-none text-sm text-[#f0f6fc]">
                         <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                    <span className="text-[10px] text-slate-500 font-data mt-2 block text-right opacity-70">
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
              {isSending && (
                 <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-[#161b22] border border-[#21262d] flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="bg-slate-800/60 border-l-2 border-cyan-500/30 rounded-2xl rounded-tl-none px-5 py-3 flex items-center h-[46px]">
                    <div className="flex gap-1 py-1">
                      {[0,1,2].map(i => (
                        <div key={i} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          
          <div className="p-4 border-t border-[#21262d] bg-[#0d1117] shrink-0">
            <div className="flex gap-2 overflow-x-auto mb-3 pb-2 scrollbar-hide">
              {['What should I work on next?', 'Can I finish before tomorrow?', 'Replan my schedule.', 'What is blocking my progress?'].map(suggestion => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="px-3 py-1.5 text-xs bg-[#161b22] text-[#8b949e] rounded-lg hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors whitespace-nowrap border border-[#21262d]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <form onSubmit={handleSend} className="flex gap-2">
              <Button 
                type="button" 
                variant="outline" 
                className="bg-[#161b22] border-[#21262d] text-[#8b949e] hover:text-[#f0f6fc]"
                onClick={() => {
                  if (!('webkitSpeechRecognition' in window)) {
                    alert("Speech recognition is not supported in this browser.");
                    return;
                  }
                  const recognition = new (window as any).webkitSpeechRecognition();
                  recognition.onresult = (e: any) => setInput(e.results[0][0].transcript);
                  recognition.start();
                }}
              >
                <Mic className="w-4 h-4" />
              </Button>
              <Input 
                value={input} 
                onChange={e => setInput(e.target.value)} 
                placeholder="E.g. What should I prioritize this afternoon?" 
                className="flex-1 bg-[#161b22] border-[#21262d] text-[#f0f6fc] placeholder:text-slate-500 rounded-xl"
                disabled={isSending}
              />
              <Button type="submit" disabled={isSending || !input.trim()} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-500/20">
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
