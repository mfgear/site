import React from 'react';
import { createRoot } from 'react-dom/client';
import Button from '@/components/Button';

function App() {
  return (
    <div className="flex flex-col items-start gap-4">
      <h2 className="text-lg font-semibold">Quick Test</h2>
      <Button onClick={() => alert('Hello from React island!')}>Click me</Button>
    </div>
  );
}

const el = document.getElementById('react-root');
if (el) createRoot(el).render(<App />);

