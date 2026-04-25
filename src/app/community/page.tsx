import { Sidebar, TopBar } from "@/components/Navigation";
import { MessageSquare, ThumbsUp, ThumbsDown, User, Share2 } from "lucide-react";

export default function CommunityPage() {
  const posts = [
    {
      id: 1,
      author: "Pedro Penduko",
      time: "2 hours ago",
      content: "Does anyone know if the BGC Bus is still accepting cash? Or is it strictly Beep card only now?",
      likes: 24,
      comments: 15,
      tag: "Question"
    },
    {
      id: 2,
      author: "Maria Clara",
      time: "5 hours ago",
      content: "New P2P route spotted from Alabang to One Ayala! Starts at 6:00 AM. Very convenient for South commuters.",
      likes: 89,
      comments: 7,
      tag: "Tip"
    },
    {
      id: 3,
      author: "Juan Dela Cruz",
      time: "1 day ago",
      content: "Avoid EDSA Carousel for now, there's a stalled bus near Santolan. Traffic is backed up until Cubao.",
      likes: 156,
      comments: 42,
      tag: "Alert"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <Sidebar activePath="/community" />
      <main className="pt-20 md:pl-64 p-6 text-on-surface">
        <div className="max-w-3xl mx-auto">
          <div className="flex justify-between items-end mb-8">
            <div>
              <h1 className="font-space text-3xl font-bold">Commuter Community</h1>
              <p className="text-on-surface-variant font-inter">Verified tips and discussions from the Manila commute.</p>
            </div>
            <button className="bg-primary text-on-primary px-6 py-2 rounded-full font-bold text-sm hover:opacity-90 active:scale-95 transition-all">
              New Post
            </button>
          </div>

          <div className="space-y-6">
            {posts.map((post) => (
              <div key={post.id} className="bg-white rounded-3xl border border-outline-variant p-6 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-surface-container-high rounded-full flex items-center justify-center border border-outline-variant">
                      <User className="w-6 h-6 text-outline" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm">{post.author}</h3>
                      <p className="text-[10px] text-outline font-medium tracking-tight uppercase">{post.time}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase ${
                    post.tag === 'Alert' ? 'bg-red-50 text-red-600 border border-red-100' : 
                    post.tag === 'Tip' ? 'bg-green-50 text-green-600 border border-green-100' : 
                    'bg-blue-50 text-blue-600 border border-blue-100'
                  }`}>
                    {post.tag}
                  </span>
                </div>
                
                <p className="text-on-surface leading-relaxed mb-6 font-inter text-md">
                  {post.content}
                </p>

                <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                  <div className="flex items-center gap-6">
                    <button className="flex items-center gap-2 text-outline hover:text-primary transition-colors group">
                      <ThumbsUp className="w-5 h-5 group-active:scale-125 transition-transform" />
                      <span className="text-xs font-bold">{post.likes}</span>
                    </button>
                    <button className="flex items-center gap-2 text-outline hover:text-blue-600 transition-colors">
                      <MessageSquare className="w-5 h-5" />
                      <span className="text-xs font-bold">{post.comments}</span>
                    </button>
                  </div>
                  <button className="text-outline hover:text-on-surface transition-colors">
                    <Share2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
