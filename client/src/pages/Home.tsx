import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, AlertCircle, Zap, BarChart3 } from "lucide-react";
import { APP_TITLE, getLoginUrl } from "@/const";
import { Link } from "wouter";

export default function Home() {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Navigation */}
      <nav className="border-b border-slate-700 bg-slate-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-blue-500 rounded-lg" />
            <span className="text-xl font-bold">{APP_TITLE}</span>
          </div>
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard">
                  <Button variant="outline" className="text-white border-slate-600 hover:bg-slate-700">
                    Dashboard
                  </Button>
                </Link>
                <Button variant="ghost" onClick={logout} className="text-slate-300 hover:text-white">
                  Logout
                </Button>
              </>
            ) : (
              <Button asChild className="bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700">
                <a href={getLoginUrl()}>Login</a>
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
            Real-Time Stock Signals
          </h1>
          <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
            Analyze news from multiple legitimate sources, detect market opportunities with AI-powered sentiment analysis, and get instant notifications with minimal latency.
          </p>
          {isAuthenticated ? (
            <Link href="/dashboard">
              <Button size="lg" className="bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700 text-white text-lg px-8">
                Go to Dashboard
              </Button>
            </Link>
          ) : (
            <Button asChild size="lg" className="bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700 text-white text-lg px-8">
              <a href={getLoginUrl()}>Get Started</a>
            </Button>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <AlertCircle className="w-8 h-8 text-blue-400 mb-2" />
              <CardTitle className="text-white">Multi-Source Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-300">
                Aggregates news from Finnhub, MarketAux, and other legitimate sources
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <BarChart3 className="w-8 h-8 text-green-400 mb-2" />
              <CardTitle className="text-white">Sentiment Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-300">
                AI-powered sentiment scoring with confidence metrics
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <Zap className="w-8 h-8 text-yellow-400 mb-2" />
              <CardTitle className="text-white">Instant Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-300">
                Push notifications via ntfy.sh with minimal latency
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <TrendingUp className="w-8 h-8 text-red-400 mb-2" />
              <CardTitle className="text-white">Signal Validation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-300">
                Requires corroboration from 2+ sources to prevent false signals
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-t border-slate-700">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div>
            <p className="text-4xl font-bold text-green-400 mb-2">100% Free</p>
            <p className="text-slate-300">No subscription fees, no hidden costs</p>
          </div>
          <div>
            <p className="text-4xl font-bold text-blue-400 mb-2">Sub-5s Latency</p>
            <p className="text-slate-300">From news discovery to notification</p>
          </div>
          <div>
            <p className="text-4xl font-bold text-yellow-400 mb-2">2+ Sources</p>
            <p className="text-slate-300">Multi-source corroboration required</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-700 bg-slate-900/50 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-slate-400">
          <p>Stock Signal Bot - Real-time market analysis for personal use</p>
          <p className="text-sm mt-2">Powered by Finnhub, MarketAux, and ntfy.sh</p>
        </div>
      </footer>
    </div>
  );
}
