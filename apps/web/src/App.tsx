import { StatusCard } from './components/StatusCard/StatusCard';

function App() {
  return (
    <main>
      <h1>Supabase Heartbeat</h1>
      <StatusCard title="API" status="Not connected" />
    </main>
  );
}

export default App;
