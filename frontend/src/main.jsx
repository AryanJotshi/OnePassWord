import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import AppShell from './AppShell.jsx'
import { BrowserRouter } from 'react-router-dom'

function ThemeRootWrapper() {
  const [dark, setDark] = useState(() => (window.matchMedia('(prefers-color-scheme: dark)').matches));
  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add('dark'); else root.classList.remove('dark');
  }, [dark]);
  return <AppShell dark={dark} setDark={setDark} />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeRootWrapper />
    </BrowserRouter>
  </StrictMode>,
)
