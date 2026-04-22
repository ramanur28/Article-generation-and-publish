import { useState, useEffect } from "react";
import { GoogleGenAI, Type } from "@google/genai";
import { Settings, FileText, Send, Loader2, CheckCircle2, AlertCircle, Cog, LogOut, Lock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { WPSettings, ArticleInfo, ArticleSEO, GenerationState } from "./types";
import { auth } from "./lib/firebase";
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";

const ALLOWED_EMAIL = "ramanur321@gmail.com";

const DEFAULT_PROMPT = `Generate a high-quality, SEO-optimized English article. 
Follow these guidelines:
- Use a professional and engaging tone.
- Include relevant headings (H2, H3).
- Integrate the focus keyphrase naturally.
- Aim for high readability.
- The article should be detailed and informative.`;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [settings, setSettings] = useState<WPSettings>(() => {
    const saved = localStorage.getItem("wp_settings");
    return saved ? JSON.parse(saved) : {
      url: "",
      username: "",
      appPassword: "",
      promptTemplate: DEFAULT_PROMPT
    };
  });

  const [articleInfo, setArticleInfo] = useState<ArticleInfo>({
    focusKeyphrase: "",
    title: "",
    topic: "",
    imageId: "",
    publishDate: (() => {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      return now.toISOString().slice(0, 16);
    })()
  });

  const [seoData, setSeoData] = useState<ArticleSEO | null>(null);
  const [content, setContent] = useState("");
  const [genState, setGenState] = useState<GenerationState>({ stage: "idle", progress: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const [lastNotifiedStage, setLastNotifiedStage] = useState<string>("");

  // Sound Notification
  const playSuccessSound = () => {
    // Note: The WebSocket error in the console is a benign environment issue 
    // related to HMR being disabled and can be safely ignored.
    const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
    audio.play().catch(e => console.log("Audio play failed (this is normal if no user interaction):", e));
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser && currentUser.email === ALLOWED_EMAIL) {
        setUser(currentUser);
      } else {
        setUser(null);
        if (currentUser) {
          signOut(auth);
          alert("Access denied. Only the owner can access this application.");
        }
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      setAuthLoading(true);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Login failed", err);
      setAuthLoading(false);
      alert(err.message);
    }
  };

  useEffect(() => {
    localStorage.setItem("wp_settings", JSON.stringify(settings));
  }, [settings]);

  const handleLogout = () => {
    signOut(auth);
  };

  useEffect(() => {
    const isGenerationDone = genState.stage === 'idle' && genState.progress === 100 && content;
    const isPublishingDone = genState.stage === 'completed';

    if (isGenerationDone && lastNotifiedStage !== 'generation') {
      playSuccessSound();
      setLastNotifiedStage('generation');
    } else if (isPublishingDone && lastNotifiedStage !== 'publishing') {
      playSuccessSound();
      setLastNotifiedStage('publishing');
    }
    
    // Reset notification tracker when stage returns to active work
    if (genState.stage === 'outline' || genState.stage === 'publishing') {
      setLastNotifiedStage(genState.stage === 'outline' ? 'working' : 'publishing_active');
    }
  }, [genState.stage, genState.progress, content, lastNotifiedStage]);

  const handleGenerate = async () => {
    try {
      // Clear previous states
      setSeoData(null);
      setContent("");
      setLastNotifiedStage("");
      setGenState({ stage: "outline", progress: 10 });

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

      // Step 1: Generate Outline and SEO Meta
      const outlineResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are an SEO expert. Based on the following information, generate an optimized article outline and meta data.
        Title: ${articleInfo.title}
        Topic: ${articleInfo.topic}
        Focus Keyphrase: ${articleInfo.focusKeyphrase}
        
        Information required:
        - Meta Title (SEO title)
        - Meta Description (brief, compelling)
        - Slug (URL friendly)
        - Comprehensive Outline (H2, H3 headings)
        - Excerpt (summary for WP)
        - Suggested Category (one name)
        - Suggested Tags (array of strings)

        Return response in JSON format.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              metaTitle: { type: Type.STRING },
              metaDescription: { type: Type.STRING },
              focusKeyphrase: { type: Type.STRING },
              slug: { type: Type.STRING },
              outline: { type: Type.STRING },
              excerpt: { type: Type.STRING },
              category: { type: Type.STRING },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["metaTitle", "metaDescription", "focusKeyphrase", "slug", "outline", "excerpt", "category", "tags"]
          }
        }
      });

      const parsedSEO = JSON.parse(outlineResponse.text) as ArticleSEO;
      setSeoData(parsedSEO);
      setGenState({ stage: "content_part1", progress: 30 });

      // Step 2: Generate Content Part 1
      const part1Response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Generate the FIRST HALF of an article based on this outline:
        ${parsedSEO.outline}
        
        Article Details:
        Title: ${parsedSEO.metaTitle}
        Focus Keyphrase: ${articleInfo.focusKeyphrase}
        Writing Strategy: ${settings.promptTemplate}
        
        Instructions: Write about 600-700 words covering the first half of the outline. Use HTML tags for formatting (p, h2, h3, ul, li). Do NOT conclude yet. Focus on quality and flow.`
      });

      let fullContent = part1Response.text;
      setContent(fullContent);
      setGenState({ stage: "content_part2", progress: 60 });

      // Step 3: Generate Content Part 2
      const part2Response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Generate the SECOND HALF and CONCLUSION of the article.
        
        Previous Content Summary: ${fullContent.slice(-1000)}
        Original Outline: ${parsedSEO.outline}
        Writing Strategy: ${settings.promptTemplate}
        
        Instructions: Write finishing 600-700 words completing the article based on the remaining outline points. Ensure a strong conclusion. Use HTML formatting (p, h2, h3, ul, li). Maintain the same tone as the previous part.`
      });

      fullContent += "\n" + part2Response.text;
      setContent(fullContent);
      setGenState({ stage: "idle", progress: 100 });

    } catch (err: any) {
      console.error(err);
      setGenState({ stage: "idle", progress: 0, error: err.message });
    }
  };

  const handlePublish = async () => {
    if (!seoData || !content) return;

    try {
      setGenState(prev => ({ ...prev, stage: "publishing", progress: 90 }));

      // WordPress REST API 'date' field expects the local time of the site.
      // We take the value from raw input ('2024-04-22T10:00') and just ensure it's compatible.
      const localDateString = articleInfo.publishDate + ":00";

      const postData = {
        title: articleInfo.title || seoData.metaTitle,
        content: content,
        status: "future", // Schedule it
        date: localDateString,
        slug: seoData.slug,
        excerpt: seoData.excerpt,
        featured_media: parseInt(articleInfo.imageId) || undefined,
        category_names: seoData.category,
        tag_names: seoData.tags,
        // SiteSEO Meta Data - using user-specified keys
        meta: {
          _siteseo_titles_title: seoData.metaTitle,
          _siteseo_titles_desc: seoData.metaDescription,
          _siteseo_analysis_target_kw: seoData.focusKeyphrase || articleInfo.focusKeyphrase,
          _siteseo_robots_canonical: ""
        }
      };

      const response = await fetch("/api/wp-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: settings.url,
          username: settings.username,
          password: settings.appPassword,
          method: "POST",
          endpoint: "/wp/v2/posts",
          data: postData
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.code || "Failed to publish to WordPress");
      }

      setGenState({ stage: "completed", progress: 100 });
    } catch (err: any) {
      console.error(err);
      setGenState(prev => ({ ...prev, stage: "idle", error: err.message }));
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin opacity-20" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-[#141414] p-8 rounded-lg shadow-xl text-center space-y-6">
          <div className="flex justify-center">
            <div className="p-4 bg-[#141414]/5 rounded-full">
              <Lock className="w-12 h-12" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-serif italic mb-2">Private Application</h1>
            <p className="text-sm opacity-60">This tool is restricted to the administrator only.</p>
          </div>
          <button 
            onClick={handleLogin}
            className="w-full bg-[#141414] text-[#F5F5F0] py-4 rounded font-bold uppercase tracking-widest text-xs hover:bg-black transition-colors"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto flex flex-col gap-8">
        {/* Header */}
        <header className="flex justify-between items-center border-b border-[#141414] pb-4">
          <div>
            <h1 className="text-3xl font-serif italic tracking-tight">WordPress Article Automator</h1>
            <p className="text-sm opacity-60">Admin: {user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 hover:bg-[#141414] hover:text-[#F5F5F0] transition-colors rounded-full"
            >
              <Cog className="w-6 h-6" />
            </button>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-red-600 hover:text-white transition-colors rounded-full"
              title="Sign Out"
            >
              <LogOut className="w-6 h-6" />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Controls */}
          <div className="lg:col-span-5 space-y-6">
            <AnimatePresence>
              {showSettings && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border border-[#141414] bg-white p-6 rounded-lg"
                >
                  <h2 className="text-lg font-serif italic mb-4">WordPress Settings</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider opacity-50 block mb-1">Site URL</label>
                      <input 
                        type="url" 
                        value={settings.url}
                        onChange={e => setSettings({...settings, url: e.target.value})}
                        placeholder="https://example.com"
                        className="w-full border-b border-[#141414] py-1 text-sm focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider opacity-50 block mb-1">Username</label>
                      <input 
                        type="text" 
                        value={settings.username}
                        onChange={e => setSettings({...settings, username: e.target.value})}
                        className="w-full border-b border-[#141414] py-1 text-sm focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider opacity-50 block mb-1">App Password</label>
                      <input 
                        type="password" 
                        value={settings.appPassword}
                        onChange={e => setSettings({...settings, appPassword: e.target.value})}
                        placeholder="xxxx xxxx xxxx xxxx"
                        className="w-full border-b border-[#141414] py-1 text-sm focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider opacity-50 block mb-1">Generation Prompt</label>
                      <textarea 
                        rows={4}
                        value={settings.promptTemplate}
                        onChange={e => setSettings({...settings, promptTemplate: e.target.value})}
                        className="w-full border border-[#141414]/20 p-2 text-sm focus:outline-none rounded"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="border border-[#141414] bg-white p-6 rounded-lg space-y-6">
              <h2 className="text-xl font-serif italic flex items-center gap-2">
                <FileText className="w-5 h-5" /> Article Details
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="text-[10px] uppercase tracking-wider opacity-50 block mb-1">Working Title</label>
                  <input 
                    type="text" 
                    value={articleInfo.title}
                    onChange={e => setArticleInfo({...articleInfo, title: e.target.value})}
                    placeholder="Enter main title..."
                    className="w-full border-b border-[#141414] py-2 text-lg font-medium focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider opacity-50 block mb-1">Topic</label>
                  <input 
                    type="text" 
                    value={articleInfo.topic}
                    onChange={e => setArticleInfo({...articleInfo, topic: e.target.value})}
                    placeholder="e.g. Modern Web Design"
                    className="w-full border-b border-[#141414] py-1 text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider opacity-50 block mb-1">Focus Keyphrase</label>
                  <input 
                    type="text" 
                    value={articleInfo.focusKeyphrase}
                    onChange={e => setArticleInfo({...articleInfo, focusKeyphrase: e.target.value})}
                    placeholder="e.g. SEO tips 2024"
                    className="w-full border-b border-[#141414] py-1 text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider opacity-50 block mb-1">Featured Image ID</label>
                  <input 
                    type="text" 
                    value={articleInfo.imageId}
                    onChange={e => setArticleInfo({...articleInfo, imageId: e.target.value})}
                    placeholder="e.g. 123"
                    className="w-full border-b border-[#141414] py-1 text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider opacity-50 block mb-1">Publish Date & Time</label>
                  <input 
                    type="datetime-local" 
                    value={articleInfo.publishDate}
                    onChange={e => setArticleInfo({...articleInfo, publishDate: e.target.value})}
                    className="w-full border-b border-[#141414] py-1 text-sm focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  disabled={genState.stage !== 'idle' || !articleInfo.title}
                  onClick={handleGenerate}
                  className="flex-1 bg-[#141414] text-[#F5F5F0] py-3 rounded flex items-center justify-center gap-2 disabled:opacity-50 transition-all font-medium uppercase tracking-widest text-xs"
                >
                  {genState.stage === 'idle' ? (
                    <>Generate Draft <Send className="w-4 h-4" /></>
                  ) : (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {genState.stage.replace('_', ' ')}...</>
                  )}
                </button>
              </div>
              
              {genState.error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {genState.error}
                </div>
              )}
            </div>
          </div>

          {/* Preview & Results */}
          <div className="lg:col-span-7">
            <div className="border border-[#141414] bg-white rounded-lg h-full flex flex-col min-h-[600px]">
              <div className="border-b border-[#141414] p-4 flex justify-between items-center">
                <h3 className="font-serif italic">Preview & SEO Data</h3>
                {genState.stage === 'completed' && (
                  <span className="flex items-center gap-1 text-green-600 text-xs font-bold uppercase">
                    <CheckCircle2 className="w-4 h-4" /> Published Successfully
                  </span>
                )}
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                {!seoData && !content && genState.stage === 'idle' && (
                  <div className="h-full flex flex-col items-center justify-center opacity-30 text-center py-20">
                    <FileText className="w-16 h-16 mb-4" />
                    <p className="text-sm">Enter article details and generate a draft to see preview here.</p>
                  </div>
                )}

                {seoData && (
                  <section className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-gray-50 border border-black/10 rounded">
                        <label className="text-[9px] uppercase tracking-widest opacity-50 block mb-1">SEO Title</label>
                        <input 
                          type="text"
                          value={seoData.metaTitle}
                          onChange={e => setSeoData({...seoData, metaTitle: e.target.value})}
                          className="w-full bg-transparent text-sm font-semibold focus:outline-none border-b border-black/10"
                        />
                      </div>
                      <div className="p-4 bg-gray-50 border border-black/10 rounded">
                        <label className="text-[9px] uppercase tracking-widest opacity-50 block mb-1">Focus Keyphrase</label>
                        <input 
                          type="text"
                          value={seoData.focusKeyphrase}
                          onChange={e => setSeoData({...seoData, focusKeyphrase: e.target.value})}
                          className="w-full bg-transparent text-sm font-semibold focus:outline-none border-b border-black/10"
                        />
                      </div>
                      <div className="p-4 bg-gray-50 border border-black/10 rounded">
                        <label className="text-[9px] uppercase tracking-widest opacity-50 block mb-1">URL Slug</label>
                        <input 
                          type="text"
                          value={seoData.slug}
                          onChange={e => setSeoData({...seoData, slug: e.target.value})}
                          className="w-full bg-transparent text-sm font-mono focus:outline-none border-b border-black/10"
                        />
                      </div>
                    </div>
                    <div className="p-4 bg-gray-50 border border-black/10 rounded">
                      <label className="text-[9px] uppercase tracking-widest opacity-50 block mb-1">Meta Description</label>
                      <textarea 
                        value={seoData.metaDescription}
                        onChange={e => setSeoData({...seoData, metaDescription: e.target.value})}
                        className="w-full bg-transparent text-sm italic focus:outline-none border-b border-black/10 min-h-[60px]"
                      />
                    </div>
                    <div className="p-4 bg-gray-50 border border-black/10 rounded">
                      <label className="text-[9px] uppercase tracking-widest opacity-50 block mb-1">Excerpt</label>
                      <textarea 
                        value={seoData.excerpt}
                        onChange={e => setSeoData({...seoData, excerpt: e.target.value})}
                        className="w-full bg-transparent text-sm focus:outline-none border-b border-black/10 min-h-[60px]"
                      />
                    </div>
                    <div className="p-4 bg-gray-50 border border-black/10 rounded">
                      <label className="text-[9px] uppercase tracking-widest opacity-50 block mb-1">Category & Tags (Names, comma separated)</label>
                      <div className="flex flex-col gap-2">
                        <input 
                          type="text" 
                          value={seoData.category}
                          onChange={e => setSeoData({...seoData, category: e.target.value})}
                          className="w-full bg-transparent text-[10px] uppercase font-bold focus:outline-none border-b border-black/10"
                          placeholder="Category"
                        />
                        <input 
                          type="text" 
                          value={seoData.tags.join(", ")}
                          onChange={e => setSeoData({...seoData, tags: e.target.value.split(",").map(t => t.trim())})}
                          className="w-full bg-transparent text-[10px] focus:outline-none border-b border-black/10"
                          placeholder="Tags (tag1, tag2...)"
                        />
                      </div>
                    </div>
                  </section>
                )}

                {content && (
                  <section className="prose prose-sm max-w-none prose-headings:font-serif prose-headings:italic">
                    <div className="border-t border-black/10 pt-6">
                      <textarea 
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        className="w-full bg-transparent p-2 border border-black/10 rounded min-h-[400px] font-sans text-sm focus:outline-none"
                      />
                    </div>
                  </section>
                )}
              </div>

              {content && genState.stage === 'idle' && (
                <div className="p-4 bg-gray-100 border-t border-[#141414]">
                  <button 
                    onClick={handlePublish}
                    className="w-full bg-[#141414] text-[#F5F5F0] py-3 rounded flex items-center justify-center gap-2 hover:bg-black transition-colors font-medium uppercase tracking-widest text-xs"
                  >
                    Schedule to WordPress <Send className="w-4 h-4" />
                  </button>
                </div>
              )}

              {genState.stage === 'publishing' && (
                <div className="p-4 flex items-center justify-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-xs uppercase tracking-widest font-bold">Publishing to WordPress...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #141414;
        }
      `}</style>
    </div>
  );
}
