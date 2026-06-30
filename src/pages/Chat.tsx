import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Send, Bot, Mic, Loader2, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { Task } from '../types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: any;
}

export function Chat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  const drawVisualizer = () => {
    if (!canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      canvasCtx.fillStyle = 'rgba(13, 17, 23, 0.2)';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      canvasCtx.lineWidth = 3;
      canvasCtx.strokeStyle = '#f87171'; // red-400
      canvasCtx.beginPath();

      const sliceWidth = (canvas.width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      canvasCtx.lineTo(canvas.width, canvas.height / 2);
      canvasCtx.stroke();
    };

    draw();
  };
  
  const toggleRecording = async () => {
    if (isRecording) {
      stopRecording();
      return;
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error("Speech recognition is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsRecording(true);
        setTimeout(drawVisualizer, 100);
      };

      let finalTranscript = input ? input + ' ' : '';

      recognition.onresult = (e: any) => {
        let interimTranscript = '';
        for (let i = e.resultIndex; i < e.results.length; ++i) {
          if (e.results[i].isFinal) {
            finalTranscript += e.results[i][0].transcript + ' ';
          } else {
            interimTranscript += e.results[i][0].transcript;
          }
        }
        setInput(finalTranscript + interimTranscript);
      };

      recognition.onerror = (e: any) => {
        console.error('Speech recognition error', e.error);
        stopRecording();
        if (e.error === 'not-allowed') {
          toast.error("Microphone access denied.");
        }
      };

      recognition.onend = () => {
        stopRecording();
      };

      recognition.start();
    } catch (err) {
      console.error("Microphone access error:", err);
      toast.error("Could not access microphone for visualization.");
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    recognitionRef.current?.stop();
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
  };

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

  const fetchAllData = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const headers = { 'Authorization': `Bearer ${token}` };

      // Fetch messages
      const resChats = await fetch('/api/chats', { headers });
      if (resChats.ok) {
        const chatsData = await resChats.json();
        setMessages(chatsData);
      }

      // Fetch tasks
      const resTasks = await fetch('/api/tasks', { headers });
      if (resTasks.ok) {
        const tasksData = await resTasks.json();
        const pendingTasks = tasksData.filter((t: any) => t.status === 'pending' || t.status === 'in_progress');
        setTasks(pendingTasks);
      }

      // Fetch goals
      const resGoals = await fetch('/api/goals', { headers });
      if (resGoals.ok) {
        const goalsData = await resGoals.json();
        setGoals(goalsData);
      }
    } catch (err) {
      console.error("Failed to fetch chat dashboard data:", err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchAllData();
    }
  }, [user]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user) return;
    
    const userMsg = input.trim();
    setInput('');
    setIsSending(true);
    
    try {
      const token = await user.getIdToken();
      const headers = { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json' 
      };

      // Add user message to MongoDB
      const userMsgRes = await fetch('/api/chats', {
        method: 'POST',
        headers,
        body: JSON.stringify({ role: 'user', content: userMsg })
      });
      
      let savedUserMsg: Message = { role: 'user', content: userMsg };
      if (userMsgRes.ok) {
        savedUserMsg = await userMsgRes.json();
      }
      setMessages(prev => [...prev, savedUserMsg]);

      const cleanMessages = messages.map(m => ({
        role: m.role,
        content: m.content
      }));
      cleanMessages.push({ role: 'user', content: userMsg });

      const cleanTasks = tasks.map(t => ({
        title: t.title,
        description: t.description || '',
        status: t.status,
        priority: t.priority,
        estimatedHours: t.estimatedHours || 0,
        deadline: t.deadline || null
      }));

      const cleanGoals = goals.map(g => ({
        title: g.title,
        type: g.type === 'quest' ? 'Quest' : 'Habit',
        description: g.description || '',
        progress: g.progress,
        streak: g.type === 'habit' ? (g.streak || 0) : undefined,
        completed: g.completed,
        targetDate: g.targetDate || null
      }));

      const cleanQuests = cleanGoals.filter(g => g.type === 'Quest');
      const cleanHabits = cleanGoals.filter(g => g.type === 'Habit');

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          messages: cleanMessages,
          context: {
            tasks: cleanTasks,
            quests: cleanQuests,
            habits: cleanHabits
          },
          model: selectedModel
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const friendlyError = errData.error || 'The neural network is currently offline. Please try switching models.';
        
        // Add assistant error message to DB
        const errorMsgRes = await fetch('/api/chats', {
          method: 'POST',
          headers,
          body: JSON.stringify({ role: 'assistant', content: friendlyError })
        });
        const savedErrorMsg = errorMsgRes.ok ? await errorMsgRes.json() : { role: 'assistant' as const, content: friendlyError };
        setMessages(prev => [...prev, savedErrorMsg]);
        toast.error(friendlyError);
        return;
      }
      
      const data = await res.json();
      
      // Add assistant message to DB
      const assistantMsgRes = await fetch('/api/chats', {
        method: 'POST',
        headers,
        body: JSON.stringify({ role: 'assistant', content: data.text || 'No response generated.' })
      });
      const savedAssistantMsg = assistantMsgRes.ok ? await assistantMsgRes.json() : { role: 'assistant' as const, content: data.text || 'No response generated.' };
      setMessages(prev => [...prev, savedAssistantMsg]);
    } catch (error: any) {
      console.error(error);
      const fallbackError = error.message || 'Sorry, I encountered an error while thinking.';
      try {
        const token = await user.getIdToken();
        const headers = { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        };
        const assistantMsgRes = await fetch('/api/chats', {
          method: 'POST',
          headers,
          body: JSON.stringify({ role: 'assistant', content: `⚠️ **Connection Error**: ${fallbackError}` })
        });
        const savedAssistantMsg = assistantMsgRes.ok ? await assistantMsgRes.json() : { role: 'assistant' as const, content: `⚠️ **Connection Error**: ${fallbackError}` };
        setMessages(prev => [...prev, savedAssistantMsg]);
      } catch (err) {
        console.error("Double failure during error logging:", err);
      }
      toast.error(fallbackError);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto h-full flex flex-col w-full animate-fade-in relative">
      {isRecording && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0d1117]/80 backdrop-blur-md">
          <div className="bg-[#161b22] border border-red-500/30 p-8 rounded-3xl shadow-[0_0_50px_rgba(239,68,68,0.15)] flex flex-col items-center gap-6 w-[90%] max-w-md animate-fade-in relative overflow-hidden">
            <div className="absolute inset-0 bg-red-500/5 pointer-events-none animate-pulse" />
            
            <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center animate-[pulse_2s_ease-in-out_infinite] shadow-[0_0_60px_rgba(239,68,68,0.4)]">
              <Mic className="w-12 h-12 text-red-400" />
            </div>
            
            <div className="text-center space-y-2 w-full z-10">
              <h2 className="text-xl font-medium text-[#f0f6fc]">Listening...</h2>
              <div className="w-full h-24 bg-[#0d1117] rounded-2xl overflow-hidden border border-[#21262d] relative shadow-inner">
                <canvas ref={canvasRef} width="400" height="100" className="w-full h-full object-cover opacity-80" />
              </div>
              <p className="text-sm text-[#8b949e] line-clamp-3 overflow-hidden text-ellipsis px-2 min-h-[40px] mt-4">
                {input || "Speak now..."}
              </p>
            </div>
            
            <Button 
              type="button"
              onClick={stopRecording}
              className="mt-6 rounded-full px-12 h-14 bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 hover:text-red-300 font-bold tracking-wide transition-all shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:shadow-[0_0_30px_rgba(239,68,68,0.4)] flex items-center gap-3 z-10"
            >
              <div className="w-3 h-3 rounded-sm bg-red-400 animate-pulse" />
              Stop Recording
            </Button>
          </div>
        </div>
      )}

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
              <SelectValue placeholder={isLoadingModels ? "Syncing core brains..." : "Choose model"}>
                {(value: string) => {
                  if (isLoadingModels) return "Syncing core brains...";
                  const m = models.find(m => m.name === value);
                  return m ? m.displayName : (value ? value.replace(/^models\//, '') : "Choose model");
                }}
              </SelectValue>
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
                      <div className="prose prose-sm prose-invert max-w-none text-sm text-[#f0f6fc] markdown-body">
                         <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                    <span className="text-[10px] text-slate-500 font-data mt-2 block text-right opacity-70">
                      {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
            <form onSubmit={handleSend} className="flex gap-2 relative">
              <Button 
                type="button" 
                variant="outline" 
                className={`transition-all rounded-xl ${isRecording ? 'bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.3)] scale-105' : 'bg-[#161b22] border-[#21262d] text-[#8b949e] hover:text-[#f0f6fc]'}`}
                onClick={toggleRecording}
                title={isRecording ? "Stop recording" : "Start recording"}
              >
                <Mic className={`w-4 h-4 ${isRecording ? 'animate-[pulse_1s_ease-in-out_infinite]' : ''}`} />
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
