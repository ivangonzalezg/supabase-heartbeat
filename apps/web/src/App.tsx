import { useEffect, useState } from 'react';
import { StatusCard } from './components/StatusCard/StatusCard';

type ApiStatus = 'Loading' | 'API online' | 'API unavailable';

function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('Loading');

  useEffect(() => {
    let cancelled = false;

    fetch('/api/health')
      .then(async (response) => {
        if (!response.ok) {
          return false;
        }
        // A 200 alone doesn't prove this reached the API, since a misrouted
        // proxy could return Vite's HTML with the same status.
        const body: unknown = await response.json();
        return (
          typeof body === 'object' &&
          body !== null &&
          (body as { status?: unknown }).status === 'ok'
        );
      })
      .then((isHealthy) => {
        if (!cancelled) {
          setApiStatus(isHealthy ? 'API online' : 'API unavailable');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setApiStatus('API unavailable');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>Supabase Heartbeat</h1>
      <StatusCard title="API" status={apiStatus} />
    </main>
  );
}

export default App;
