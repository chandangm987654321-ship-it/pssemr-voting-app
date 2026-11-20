import { useState } from 'react';
import { AdminPanel } from './components/AdminPanel.tsx';
import { HomePage } from './components/HomePage.tsx';
import { ResultPanel } from './components/ResultPanel.tsx';
import { ToastProvider } from './components/ui/Toast.tsx';
import { VoterPanel } from './components/VoterPanel.tsx';

type ActiveView = 'home' | 'voter' | 'result' | 'admin';

function PssemrApp() {
  const [view, setView] = useState<ActiveView>('home');

  return (
    <>
      {view === 'home' && (
        <HomePage
          onOpenVoterPanel={() => setView('voter')}
          onOpenResultPanel={() => setView('result')}
          onOpenAdminPanel={() => setView('admin')}
        />
      )}
      {view === 'voter' && <VoterPanel onBackHome={() => setView('home')} />}
      {view === 'result' && <ResultPanel onBackHome={() => setView('home')} />}
      {view === 'admin' && <AdminPanel onBackHome={() => setView('home')} />}
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <PssemrApp />
    </ToastProvider>
  );
}
