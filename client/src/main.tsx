import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { QChatProvider } from './context/ProjectContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QChatProvider>
      <App />
    </QChatProvider>
  </StrictMode>,
)
