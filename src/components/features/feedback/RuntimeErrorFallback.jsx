// Last-resort recovery screen for unexpected React rendering failures.
import { ArrowRight, Home, RefreshCw } from "lucide-react";

export default function RuntimeErrorFallback({ onRetry, onGoHome }) {
  return (
    <main className="grid min-h-screen place-items-center bg-cream px-5 py-10 text-ink sm:px-8">
      <section className="w-full max-w-xl overflow-hidden rounded-[2rem] border border-ink/10 bg-white shadow-soft">
        <div className="h-2 bg-leaf" />
        <div className="p-7 sm:p-10 lg:p-12">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-leaf">Swavalambi Siddaganga Oil Mill</p>
          <h1 className="mt-5 font-serif text-4xl font-semibold leading-tight sm:text-5xl">Something went wrong</h1>
          <p className="mt-4 max-w-md text-base leading-7 text-ink/60">
            This page encountered an unexpected problem. Your last action will not be repeated.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={onRetry} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-sm font-bold text-white transition hover:bg-leaf focus:outline-none focus:ring-2 focus:ring-leaf focus:ring-offset-2">
              <RefreshCw size={17} /> Try Again
            </button>
            <button type="button" onClick={onGoHome} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-ink/15 bg-white px-6 text-sm font-bold text-ink transition hover:border-leaf hover:text-leaf focus:outline-none focus:ring-2 focus:ring-leaf focus:ring-offset-2">
              <Home size={17} /> Go Home <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
