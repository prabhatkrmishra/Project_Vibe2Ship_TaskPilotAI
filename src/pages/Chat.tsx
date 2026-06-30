import { useState, useRef, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Send, Bot, Mic, Loader2, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: any;
}

export function Chat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);
  
  const [models, setModelsList] = useState<{ name: string; displayName: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('selected_gemini_model') || 'models/gemini-3.5-flash';
  });
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  useEffect(() => {
    const fetchModels = async () => {
      if (!user) return;
      setIsLoadingModels(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/models', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          setModelsList(data);
          
          // If the currently saved model is not in the list, but list has items, set to default or first
          const exists = data.some((m: any) => m.name === selectedModel);
          if (!exists && data.length > 0) {
            const defaultModel = data.find((m: any) => m.name.includes('gemini-3.5-flash'))?.name || data[0].name;
            setSelectedModel(defaultModel);
            localStorage.setItem('selected_gemini_model', defaultModel);
          }
        }
      } catch (error) {
        console.error("Failed to load models:", error);
      } finally {
        setIsLoadingModels(false);
      }
    };
    
    fetchModels();
  }, [user]);

  const handleModelChange = (value: string) => {
    setSelectedModel(value);
    localStorage.setItem('selected_gemini_model', value);
    toast.success(`Active AI Model changed to: ${value.split('/').pop()}`);
  };

  useEffect(() => {
    if (!user) return;
    const db = getDb();
    const q = query(
      collection(db, 'users', user.uid, 'chat_messages'),
      orderBy('timestamp', 'asc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messagesData = snapshot.docs.map(doc => ({
        ...doc.data()
      })) as Message[];
      setMessages(messagesData);
    });

    return () => unsubscribe();
  }, [user]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user) return;
    
    const userMsg = input.trim();
    setInput('');
    setIsSending(true);
    
    try {
      const db = getDb();
      // Add user message to firestore
      await addDoc(collection(db, 'users', user.uid, 'chat_messages'), {
        role: 'user',
        content: userMsg,
        timestamp: serverTimestamp()
      });

      const token = await user.getIdToken();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          messages: [...messages, { role: 'user', content: userMsg }], 
          context: [],
          model: selectedModel
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const friendlyError = errData.error || 'The neural network is currently offline. Please try switching models.';
        
        // Add assistant error message to firestore so the user sees it!
        await addDoc(collection(db, 'users', user.uid, 'chat_messages'), {
          role: 'assistant',
          content: friendlyError,
          timestamp: serverTimestamp()
        });
        toast.error(friendlyError);
        return;
      }
      
      const data = await res.json();
      
      // Add assistant message to firestore
      await addDoc(collection(db, 'users', user.uid, 'chat_messages'), {
        role: 'assistant',
        content: data.text || 'No response generated.',
        timestamp: serverTimestamp()
      });
    } catch (error: any) {
      console.error(error);
      const fallbackError = error.message || 'Sorry, I encountered an error while thinking.';
      const db = getDb();
      await addDoc(collection(db, 'users', user.uid, 'chat_messages'), {
        role: 'assistant',
        content: `⚠️ **Connection Error**: ${fallbackError}`,
        timestamp: serverTimestamp()
      });
      toast.error(fallbackError);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto h-full flex flex-col w-full">
      <div className="mb-6 px-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light text-[#f0f6fc] leading-tight">Pilot <br/><span className="font-semibold italic text-indigo-400">Intelligence</span></h1>
          <p className="text-[#8b949e] mt-2">Ask for schedule adjustments, task breakdowns, or productivity advice.</p>
        </div>
        
        <div className="flex flex-col gap-1.5 shrink-0 sm:w-64">
          <label className="text-xs font-semibold text-slate-400 tracking-wider flex items-center gap-1.5 uppercase font-mono">
            <Sparkles className="w-3 h-3 text-indigo-400 animate-pulse" /> Active AI Brain
          </label>
          <Select value={selectedModel} onValueChange={handleModelChange} disabled={isLoadingModels}>
            <SelectTrigger className="bg-[#0d1117] border-[#21262d] text-[#f0f6fc] h-10 rounded-xl focus:ring-1 focus:ring-indigo-500">
              <SelectValue placeholder={isLoadingModels ? "Syncing core brains..." : "Choose model"} />
            </SelectTrigger>
            <SelectContent className="bg-[#0d1117] border-[#21262d] text-[#f0f6fc]">
              {isLoadingModels ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500 mr-2" />
                  <span className="text-xs text-slate-400">Querying brain nodes...</span>
                </div>
              ) : (
                models.map((model) => (
                  <SelectItem key={model.name} value={model.name} className="focus:bg-indigo-600/20 focus:text-indigo-200">
                    {model.displayName}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 bg-[#0d1117] border border-[#21262d] rounded-3xl overflow-hidden shadow-2xl">
        <div className="flex-1 flex flex-col p-0 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-indigo-500/20 scrollbar-track-transparent" ref={scrollRef}>
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
              <div ref={messagesEndRef} />
            </div>
          </div>
          
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
